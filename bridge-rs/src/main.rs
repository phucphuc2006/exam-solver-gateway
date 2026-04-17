use std::{
    collections::HashMap,
    env,
    net::SocketAddr,
    sync::Arc,
    time::Duration,
};

use anyhow::{anyhow, Context, Result};
use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        ConnectInfo, Query, State,
    },
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Json, Response},
    routing::get,
    Router,
};
use chrono::{DateTime, Utc};
use futures_util::{stream::SplitSink, SinkExt, StreamExt};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tokio::{net::TcpListener, sync::RwLock};
use tracing::{info, warn};
use uuid::Uuid;

const OPENAI_PROTOCOL: &str = "nexus-wb-openai.v1";
const NATIVE_PROTOCOL: &str = "nexus-wb-native.v1";
const CONTROL_PROTOCOL: &str = "nexus-wb-control.v1";
const INTERNAL_SECRET_HEADER: &str = "x-web-bridge-internal-secret";

#[derive(Clone)]
struct AppState {
    config: AppConfig,
    client: Client,
    cache: Arc<RwLock<RuntimeCache>>,
    metrics: Arc<RwLock<RuntimeMetrics>>,
}

#[derive(Clone)]
struct AppConfig {
    bind_addr: String,
    port: u16,
    node_base_url: String,
    internal_secret: String,
}

#[derive(Debug, Clone, Default, Serialize)]
struct RuntimeMetrics {
    control_connected: bool,
    active_public_connections: usize,
    active_streams: usize,
    total_requests: u64,
    completed_requests: u64,
    failed_requests: u64,
    last_control_sync_at: Option<String>,
    last_control_pong_at: Option<String>,
    last_error: Option<String>,
}

#[derive(Debug, Clone, Default)]
struct RuntimeCache {
    require_api_key: bool,
    api_keys: Vec<ApiKeyEntry>,
    sessions: HashMap<String, Value>,
    tickets: HashMap<String, BrowserTicket>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ApiKeyEntry {
    #[serde(default)]
    id: String,
    #[serde(default)]
    key: String,
    #[serde(default)]
    name: String,
}

#[derive(Debug, Clone)]
struct BrowserTicket {
    label: String,
    expires_at: DateTime<Utc>,
}

#[derive(Debug, Clone)]
struct BridgeClientRequest {
    request_id: String,
    provider: String,
    model: String,
    body: Value,
    stream: bool,
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info".into()),
        )
        .init();

    let config = AppConfig::from_env();
    let listener = TcpListener::bind(format!("{}:{}", config.bind_addr, config.port))
        .await
        .with_context(|| format!("failed to bind {}:{}", config.bind_addr, config.port))?;

    let state = AppState {
        config: config.clone(),
        client: Client::builder()
            .tcp_nodelay(true)
            .build()
            .context("failed to build reqwest client")?,
        cache: Arc::new(RwLock::new(RuntimeCache::default())),
        metrics: Arc::new(RwLock::new(RuntimeMetrics::default())),
    };

    info!(
        bind_addr = %config.bind_addr,
        port = config.port,
        node_base_url = %config.node_base_url,
        "Rust Web Bridge listening"
    );

    let app = Router::new()
        .route("/healthz", get(health_handler))
        .route("/ws/bridge", get(public_bridge_handler))
        .route("/ws/control", get(control_bridge_handler))
        .with_state(state);

    axum::serve(listener, app.into_make_service_with_connect_info::<SocketAddr>())
        .with_graceful_shutdown(shutdown_signal())
        .await
        .context("axum server failed")
}

impl AppConfig {
    fn from_env() -> Self {
        let bind_addr = env::var("WEB_BRIDGE_BIND_ADDR").unwrap_or_else(|_| "0.0.0.0".into());
        let port = env::var("WEB_BRIDGE_PORT")
            .ok()
            .and_then(|value| value.parse::<u16>().ok())
            .unwrap_or(21420);
        let node_base_url =
            env::var("WEB_BRIDGE_NODE_BASE_URL").unwrap_or_else(|_| "http://127.0.0.1:21088".into());
        let internal_secret = env::var("WEB_BRIDGE_INTERNAL_SECRET")
            .unwrap_or_else(|_| format!("wb-{}", Uuid::new_v4().simple()));

        Self {
            bind_addr,
            port,
            node_base_url,
            internal_secret,
        }
    }
}

async fn shutdown_signal() {
    let ctrl_c = async {
        let _ = tokio::signal::ctrl_c().await;
    };

    #[cfg(unix)]
    let terminate = async {
        use tokio::signal::unix::{signal, SignalKind};
        if let Ok(mut stream) = signal(SignalKind::terminate()) {
            let _ = stream.recv().await;
        }
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }
}

async fn health_handler(State(state): State<AppState>) -> impl IntoResponse {
    let metrics = state.metrics.read().await.clone();
    Json(json!({
        "ok": true,
        "service": "web-bridge-rs",
        "time": now_iso(),
        "metrics": metrics,
    }))
}

async fn control_bridge_handler(
    State(state): State<AppState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    ws: WebSocketUpgrade,
) -> Response {
    if !addr.ip().is_loopback() {
        return json_error_response(StatusCode::FORBIDDEN, "Control websocket is loopback-only.");
    }

    if select_protocol(&headers) != Some(CONTROL_PROTOCOL) {
        return json_error_response(
            StatusCode::BAD_REQUEST,
            "Missing or unsupported websocket protocol for control plane.",
        );
    }

    ws.protocols([CONTROL_PROTOCOL])
        .on_upgrade(move |socket| handle_control_socket(socket, state))
        .into_response()
}

async fn public_bridge_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<HashMap<String, String>>,
    ws: WebSocketUpgrade,
) -> Response {
    let protocol = match select_protocol(&headers) {
        Some(OPENAI_PROTOCOL) => OPENAI_PROTOCOL,
        Some(NATIVE_PROTOCOL) => NATIVE_PROTOCOL,
        _ => {
            return json_error_response(
                StatusCode::BAD_REQUEST,
                "Missing or unsupported websocket protocol for public bridge.",
            )
        }
    };

    if let Err(error_response) = authorize_public_socket(&state, &headers, &query).await {
        return error_response;
    }

    ws.protocols([protocol])
        .on_upgrade(move |socket| handle_public_socket(socket, state, protocol))
        .into_response()
}

async fn handle_control_socket(socket: WebSocket, state: AppState) {
    {
        let mut metrics = state.metrics.write().await;
        metrics.control_connected = true;
        metrics.last_error = None;
    }

    let (mut sender, mut receiver) = socket.split();

    if let Err(error) = send_json_message(&mut sender, json!({ "type": "state.sync.request" })).await {
        record_runtime_error(&state, format!("control init failed: {error}")).await;
        let mut metrics = state.metrics.write().await;
        metrics.control_connected = false;
        return;
    }

    let metrics_state = state.metrics.clone();
    let mut periodic_sender = sender;
    let periodic_task = tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(10));
        loop {
            interval.tick().await;

            if send_json_message(
                &mut periodic_sender,
                json!({
                    "type": "health.ping",
                    "payload": { "timestamp": now_iso() }
                }),
            )
            .await
            .is_err()
            {
                break;
            }

            let snapshot = metrics_state.read().await.clone();
            if send_json_message(
                &mut periodic_sender,
                json!({
                    "type": "runtime.metrics",
                    "payload": snapshot,
                }),
            )
            .await
            .is_err()
            {
                break;
            }
        }
    });

    while let Some(message_result) = receiver.next().await {
        let text = match message_result {
            Ok(message) => match message_to_text(message) {
                Some(text) => text,
                None => continue,
            },
            Err(error) => {
                record_runtime_error(&state, format!("control receive failed: {error}")).await;
                break;
            }
        };

        let parsed: Value = match serde_json::from_str(&text) {
            Ok(value) => value,
            Err(error) => {
                record_runtime_error(&state, format!("control json parse failed: {error}")).await;
                continue;
            }
        };

        if let Err(error) = apply_control_message(&state, &parsed).await {
            record_runtime_error(&state, format!("control apply failed: {error}")).await;
        }
    }

    periodic_task.abort();
    let mut metrics = state.metrics.write().await;
    metrics.control_connected = false;
}

async fn handle_public_socket(socket: WebSocket, state: AppState, protocol: &'static str) {
    {
        let mut metrics = state.metrics.write().await;
        metrics.active_public_connections += 1;
    }

    let (mut sender, mut receiver) = socket.split();

    while let Some(message_result) = receiver.next().await {
        let text = match message_result {
            Ok(message) => match message_to_text(message) {
                Some(text) => text,
                None => continue,
            },
            Err(error) => {
                record_runtime_error(&state, format!("bridge receive failed: {error}")).await;
                break;
            }
        };

        let request = match parse_client_request(&text, protocol) {
            Ok(request) => request,
            Err(error) => {
                let _ = send_protocol_error(&mut sender, protocol, None, &error.to_string()).await;
                continue;
            }
        };

        if let Err(error) = process_bridge_request(&state, &mut sender, protocol, request).await {
            record_runtime_error(&state, format!("bridge request failed: {error}")).await;
        }
    }

    let mut metrics = state.metrics.write().await;
    metrics.active_public_connections = metrics.active_public_connections.saturating_sub(1);
}

async fn process_bridge_request(
    state: &AppState,
    sender: &mut SplitSink<WebSocket, Message>,
    protocol: &'static str,
    request: BridgeClientRequest,
) -> Result<()> {
    {
        let mut metrics = state.metrics.write().await;
        metrics.total_requests += 1;
    }

    if protocol == OPENAI_PROTOCOL {
        send_json_message(
            sender,
            json!({
                "type": "response.started",
                "request_id": request.request_id,
                "provider": request.provider,
                "model": request.model,
            }),
        )
        .await?;
    } else {
        send_json_message(
            sender,
            json!({
                "type": "bridge.status",
                "request_id": request.request_id,
                "provider": request.provider,
                "model": request.model,
                "status": "started",
            }),
        )
        .await?;
        send_json_message(
            sender,
            json!({
                "type": "bridge.provider_status",
                "request_id": request.request_id,
                "provider": request.provider,
                "model": request.model,
                "transport": "ws",
            }),
        )
        .await?;
    }

    let upstream_url = format!(
        "{}/api/{}/chat/completions",
        state.config.node_base_url, request.provider
    );

    let mut upstream_response = state
        .client
        .post(&upstream_url)
        .header(INTERNAL_SECRET_HEADER, &state.config.internal_secret)
        .json(&request.body)
        .send()
        .await
        .with_context(|| format!("failed to reach upstream {upstream_url}"))?;

    if let Some(metrics_payload) = metrics_from_headers(upstream_response.headers()) {
        send_metrics_event(sender, protocol, &request.request_id, metrics_payload).await?;
    }

    if !upstream_response.status().is_success() {
        let status = upstream_response.status();
        let message = upstream_error_message(upstream_response)
            .await
            .unwrap_or_else(|_| format!("Upstream returned HTTP {status}"));
        {
            let mut metrics = state.metrics.write().await;
            metrics.failed_requests += 1;
        }
        send_protocol_error(sender, protocol, Some(&request.request_id), &message).await?;
        return Ok(());
    }

    if !request.stream {
        let payload: Value = upstream_response
            .json()
            .await
            .context("failed to decode upstream json response")?;
        let completed_text = extract_completed_text(&payload);
        send_protocol_completed(
            sender,
            protocol,
            &request.request_id,
            &request.model,
            payload,
            completed_text,
        )
        .await?;
        let mut metrics = state.metrics.write().await;
        metrics.completed_requests += 1;
        return Ok(());
    }

    {
        let mut metrics = state.metrics.write().await;
        metrics.active_streams += 1;
    }

    let mut aggregated_output = String::new();
    let mut buffer = String::new();
    let mut stream = upstream_response.bytes_stream();

    while let Some(chunk_result) = stream.next().await {
        let chunk = chunk_result.context("failed reading upstream stream chunk")?;
        buffer.push_str(&String::from_utf8_lossy(&chunk));

        while let Some(boundary) = buffer.find("\n\n") {
            let raw_event = buffer[..boundary].to_string();
            buffer = buffer[boundary + 2..].to_string();

            if let Some(event) = parse_sse_event(&raw_event) {
                if event.data == "[DONE]" {
                    continue;
                }

                if event.event == "bridge_metrics" {
                    if let Ok(metrics_payload) = serde_json::from_str::<Value>(&event.data) {
                        send_metrics_event(sender, protocol, &request.request_id, metrics_payload).await?;
                    }
                    continue;
                }

                let chunk_payload: Value = match serde_json::from_str(&event.data) {
                    Ok(value) => value,
                    Err(_) => continue,
                };

                aggregated_output.push_str(&extract_chunk_text(&chunk_payload));
                send_protocol_chunk(sender, protocol, &request.request_id, chunk_payload).await?;
            }
        }
    }

    {
        let mut metrics = state.metrics.write().await;
        metrics.active_streams = metrics.active_streams.saturating_sub(1);
        metrics.completed_requests += 1;
    }

    let synthesized = synthesize_completion_payload(&request.model, &aggregated_output);
    send_protocol_completed(
        sender,
        protocol,
        &request.request_id,
        &request.model,
        synthesized,
        aggregated_output,
    )
    .await?;

    Ok(())
}

// ═══════════════════════════════════════════════════════════════
// Utility helpers
// ═══════════════════════════════════════════════════════════════

fn now_iso() -> String {
    Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

fn message_to_text(message: Message) -> Option<String> {
    match message {
        Message::Text(text) => Some(text.to_string()),
        Message::Close(_) => None,
        Message::Ping(_) | Message::Pong(_) => None,
        Message::Binary(bytes) => String::from_utf8(bytes.to_vec()).ok(),
    }
}

fn json_error_response(status: StatusCode, message: &str) -> Response {
    (
        status,
        Json(json!({
            "error": {
                "message": message,
                "type": "invalid_request_error",
            }
        })),
    )
        .into_response()
}

async fn record_runtime_error(state: &AppState, error: String) {
    warn!(error = %error, "runtime error");
    let mut metrics = state.metrics.write().await;
    metrics.last_error = Some(error);
}

// ═══════════════════════════════════════════════════════════════
// Protocol negotiation
// ═══════════════════════════════════════════════════════════════

fn select_protocol(headers: &HeaderMap) -> Option<&'static str> {
    let header_value = headers
        .get("sec-websocket-protocol")
        .and_then(|v| v.to_str().ok())?;

    for token in header_value.split(',') {
        let trimmed = token.trim();
        if trimmed == OPENAI_PROTOCOL {
            return Some(OPENAI_PROTOCOL);
        }
        if trimmed == NATIVE_PROTOCOL {
            return Some(NATIVE_PROTOCOL);
        }
        if trimmed == CONTROL_PROTOCOL {
            return Some(CONTROL_PROTOCOL);
        }
    }

    None
}

// ═══════════════════════════════════════════════════════════════
// Client request parsing
// ═══════════════════════════════════════════════════════════════

fn parse_client_request(text: &str, protocol: &str) -> Result<BridgeClientRequest> {
    let parsed: Value =
        serde_json::from_str(text).context("invalid JSON in client request frame")?;

    let msg_type = parsed["type"]
        .as_str()
        .unwrap_or("")
        .to_string();

    if protocol == OPENAI_PROTOCOL {
        if msg_type != "request.create" {
            return Err(anyhow!(
                "Unsupported message type '{}' for openai protocol. Expected 'request.create'.",
                msg_type
            ));
        }
    } else if msg_type != "bridge.request" {
        return Err(anyhow!(
            "Unsupported message type '{}' for native protocol. Expected 'bridge.request'.",
            msg_type
        ));
    }

    let request_id = parsed["request_id"]
        .as_str()
        .map(String::from)
        .unwrap_or_else(|| Uuid::new_v4().to_string());

    let model_raw = parsed["model"]
        .as_str()
        .unwrap_or("")
        .to_string();

    let provider = if model_raw.contains('/') {
        model_raw.split('/').next().unwrap_or("").to_string()
    } else {
        parsed["provider"]
            .as_str()
            .unwrap_or("chatgpt-web")
            .to_string()
    };

    let model = if model_raw.contains('/') {
        model_raw.splitn(2, '/').nth(1).unwrap_or("auto").to_string()
    } else if model_raw.is_empty() {
        "auto".to_string()
    } else {
        model_raw
    };

    let stream = parsed["stream"].as_bool().unwrap_or(true);

    let mut body = parsed.clone();
    if let Some(obj) = body.as_object_mut() {
        obj.insert("model".into(), json!(format!("{}/{}", provider, model)));
        obj.insert("stream".into(), json!(stream));
        obj.remove("type");
        obj.remove("request_id");
        obj.remove("provider");
    }

    Ok(BridgeClientRequest {
        request_id,
        provider,
        model,
        body,
        stream,
    })
}

// ═══════════════════════════════════════════════════════════════
// Auth
// ═══════════════════════════════════════════════════════════════

async fn authorize_public_socket(
    state: &AppState,
    headers: &HeaderMap,
    query: &HashMap<String, String>,
) -> std::result::Result<(), Response> {
    let cache = state.cache.read().await;

    if !cache.require_api_key {
        return Ok(());
    }

    // Check query token (browser ticket)
    if let Some(token) = query.get("token") {
        if let Some(ticket) = cache.tickets.get(token) {
            if Utc::now() < ticket.expires_at {
                return Ok(());
            }
        }
        return Err(json_error_response(
            StatusCode::UNAUTHORIZED,
            "Browser ticket expired or invalid.",
        ));
    }

    // Check Authorization header
    let api_key = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .map(|v| v.strip_prefix("Bearer ").unwrap_or(v).trim())
        .unwrap_or("");

    if api_key.is_empty() {
        return Err(json_error_response(
            StatusCode::UNAUTHORIZED,
            "API key required. Provide via Authorization header or token query parameter.",
        ));
    }

    let key_valid = cache
        .api_keys
        .iter()
        .any(|entry| entry.key == api_key);

    if key_valid {
        Ok(())
    } else {
        Err(json_error_response(
            StatusCode::UNAUTHORIZED,
            "Invalid API key.",
        ))
    }
}

// ═══════════════════════════════════════════════════════════════
// Control plane message handling
// ═══════════════════════════════════════════════════════════════

async fn apply_control_message(state: &AppState, msg: &Value) -> Result<()> {
    let msg_type = msg["type"].as_str().unwrap_or("");

    match msg_type {
        "state.sync.snapshot" => {
            let payload = &msg["payload"];
            let mut cache = state.cache.write().await;

            cache.require_api_key = payload["settings"]["requireApiKey"]
                .as_bool()
                .unwrap_or(false);

            if let Some(keys) = payload["apiKeys"].as_array() {
                cache.api_keys = keys
                    .iter()
                    .filter_map(|k| serde_json::from_value(k.clone()).ok())
                    .collect();
            }

            if let Some(sessions) = payload["sessions"].as_object() {
                cache.sessions.clear();
                for (provider, session_value) in sessions {
                    if !session_value.is_null() {
                        cache
                            .sessions
                            .insert(provider.clone(), session_value.clone());
                    }
                }
            }

            let mut metrics = state.metrics.write().await;
            metrics.last_control_sync_at = Some(now_iso());

            info!(
                api_keys = cache.api_keys.len(),
                sessions = cache.sessions.len(),
                require_api_key = cache.require_api_key,
                "Applied state snapshot from Node"
            );
        }

        "session.upsert" => {
            let provider = msg["payload"]["provider"]
                .as_str()
                .unwrap_or("")
                .to_string();
            if !provider.is_empty() {
                let session = msg["payload"]["session"].clone();
                let mut cache = state.cache.write().await;
                cache.sessions.insert(provider.clone(), session);
                info!(provider = %provider, "Session upserted");
            }
        }

        "session.remove" => {
            let provider = msg["payload"]["provider"]
                .as_str()
                .unwrap_or("")
                .to_string();
            if !provider.is_empty() {
                let mut cache = state.cache.write().await;
                cache.sessions.remove(&provider);
                info!(provider = %provider, "Session removed");
            }
        }

        "config.update" => {
            let mut cache = state.cache.write().await;
            if let Some(val) = msg["payload"]["requireApiKey"].as_bool() {
                cache.require_api_key = val;
            }
            info!("Config updated");
        }

        "api_keys.update" => {
            if let Some(keys) = msg["payload"]["apiKeys"].as_array() {
                let mut cache = state.cache.write().await;
                cache.api_keys = keys
                    .iter()
                    .filter_map(|k| serde_json::from_value(k.clone()).ok())
                    .collect();
                info!(count = cache.api_keys.len(), "API keys updated");
            }
        }

        "cache.invalidate" => {
            let mut cache = state.cache.write().await;
            cache.sessions.clear();
            info!("Cache invalidated – sessions cleared");
        }

        "ticket.issue" => {
            let token = msg["payload"]["token"]
                .as_str()
                .unwrap_or("")
                .to_string();
            let label = msg["payload"]["label"]
                .as_str()
                .unwrap_or("dashboard")
                .to_string();
            let expires_at_str = msg["payload"]["expiresAt"]
                .as_str()
                .unwrap_or("");

            if !token.is_empty() {
                if let Ok(expires_at) = expires_at_str.parse::<DateTime<Utc>>() {
                    let mut cache = state.cache.write().await;
                    cache
                        .tickets
                        .insert(token.clone(), BrowserTicket { label, expires_at });
                    info!(token = %token, "Browser ticket issued");
                }
            }
        }

        "health.pong" => {
            let mut metrics = state.metrics.write().await;
            metrics.last_control_pong_at = Some(now_iso());
        }

        _ => {
            warn!(msg_type = msg_type, "Unknown control message type");
        }
    }

    Ok(())
}

// ═══════════════════════════════════════════════════════════════
// WebSocket send helpers
// ═══════════════════════════════════════════════════════════════

async fn send_json_message(
    sender: &mut SplitSink<WebSocket, Message>,
    value: Value,
) -> Result<()> {
    let text = serde_json::to_string(&value).context("failed to serialize ws message")?;
    sender
        .send(Message::Text(text.into()))
        .await
        .context("failed to send ws message")
}

async fn send_protocol_error(
    sender: &mut SplitSink<WebSocket, Message>,
    protocol: &str,
    request_id: Option<&str>,
    message: &str,
) -> Result<()> {
    let error_type = if protocol == OPENAI_PROTOCOL {
        "response.error"
    } else {
        "bridge.error"
    };

    let mut payload = json!({
        "type": error_type,
        "error": {
            "message": message,
            "type": "upstream_error",
        },
    });

    if let Some(rid) = request_id {
        payload["request_id"] = json!(rid);
    }

    send_json_message(sender, payload).await
}

async fn send_protocol_chunk(
    sender: &mut SplitSink<WebSocket, Message>,
    protocol: &str,
    request_id: &str,
    chunk_payload: Value,
) -> Result<()> {
    let chunk_type = if protocol == OPENAI_PROTOCOL {
        "response.chunk"
    } else {
        "bridge.delta"
    };

    send_json_message(
        sender,
        json!({
            "type": chunk_type,
            "request_id": request_id,
            "chunk": chunk_payload,
        }),
    )
    .await
}

async fn send_protocol_completed(
    sender: &mut SplitSink<WebSocket, Message>,
    protocol: &str,
    request_id: &str,
    model: &str,
    payload: Value,
    aggregated_text: String,
) -> Result<()> {
    let completed_type = if protocol == OPENAI_PROTOCOL {
        "response.completed"
    } else {
        "bridge.complete"
    };

    let mut msg = json!({
        "type": completed_type,
        "request_id": request_id,
        "model": model,
        "response": payload,
    });

    if protocol == NATIVE_PROTOCOL {
        msg["text"] = json!(aggregated_text);
    }

    send_json_message(sender, msg).await
}

async fn send_metrics_event(
    sender: &mut SplitSink<WebSocket, Message>,
    protocol: &str,
    request_id: &str,
    metrics_payload: Value,
) -> Result<()> {
    let metrics_type = if protocol == OPENAI_PROTOCOL {
        "response.metrics"
    } else {
        "bridge.provider_status"
    };

    send_json_message(
        sender,
        json!({
            "type": metrics_type,
            "request_id": request_id,
            "metrics": metrics_payload,
        }),
    )
    .await
}

// ═══════════════════════════════════════════════════════════════
// SSE parsing & upstream helpers
// ═══════════════════════════════════════════════════════════════

#[derive(Debug)]
struct SseEvent {
    event: String,
    data: String,
}

fn parse_sse_event(raw: &str) -> Option<SseEvent> {
    let mut event = String::new();
    let mut data_lines: Vec<&str> = Vec::new();

    for line in raw.lines() {
        if let Some(value) = line.strip_prefix("event:") {
            event = value.trim().to_string();
        } else if let Some(value) = line.strip_prefix("data:") {
            data_lines.push(value.trim_start_matches(' '));
        } else if line.starts_with(':') || line.is_empty() {
            // comment or blank line within event – skip
        }
    }

    if data_lines.is_empty() {
        return None;
    }

    Some(SseEvent {
        event,
        data: data_lines.join("\n"),
    })
}

fn extract_chunk_text(chunk: &Value) -> String {
    // OpenAI shape: choices[0].delta.content
    if let Some(content) = chunk
        .get("choices")
        .and_then(|c| c.get(0))
        .and_then(|c| c.get("delta"))
        .and_then(|d| d.get("content"))
        .and_then(|v| v.as_str())
    {
        return content.to_string();
    }

    // Fallback: direct text field
    chunk
        .get("text")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string()
}

fn extract_completed_text(payload: &Value) -> String {
    // OpenAI shape: choices[0].message.content
    if let Some(content) = payload
        .get("choices")
        .and_then(|c| c.get(0))
        .and_then(|c| c.get("message"))
        .and_then(|m| m.get("content"))
        .and_then(|v| v.as_str())
    {
        return content.to_string();
    }

    String::new()
}

fn synthesize_completion_payload(model: &str, output: &str) -> Value {
    json!({
        "id": format!("chatcmpl-{}", Uuid::new_v4().simple()),
        "object": "chat.completion",
        "created": Utc::now().timestamp(),
        "model": model,
        "choices": [{
            "index": 0,
            "message": {
                "role": "assistant",
                "content": output,
            },
            "finish_reason": "stop",
        }],
        "usage": {
            "prompt_tokens": 0,
            "completion_tokens": 0,
            "total_tokens": 0,
        },
    })
}

fn metrics_from_headers(headers: &reqwest::header::HeaderMap) -> Option<Value> {
    let timing = headers
        .get("x-web-bridge-timing")
        .and_then(|v| v.to_str().ok());
    let provider_status = headers
        .get("x-web-bridge-provider-status")
        .and_then(|v| v.to_str().ok());

    if timing.is_none() && provider_status.is_none() {
        return None;
    }

    let mut result = json!({});
    if let Some(t) = timing {
        result["timing"] = json!(t);
    }
    if let Some(ps) = provider_status {
        result["providerStatus"] = json!(ps);
    }

    Some(result)
}

async fn upstream_error_message(
    response: reqwest::Response,
) -> Result<String> {
    let text = response
        .text()
        .await
        .unwrap_or_default();

    if text.is_empty() {
        return Err(anyhow!("empty upstream error body"));
    }

    // Try to parse as JSON error
    if let Ok(parsed) = serde_json::from_str::<Value>(&text) {
        if let Some(msg) = parsed
            .get("error")
            .and_then(|e| e.get("message"))
            .and_then(|v| v.as_str())
        {
            return Ok(msg.to_string());
        }
        if let Some(msg) = parsed.get("message").and_then(|v| v.as_str()) {
            return Ok(msg.to_string());
        }
    }

    // Strip HTML tags and truncate
    let cleaned: String = text
        .chars()
        .fold((String::new(), false), |(mut acc, in_tag), ch| {
            if ch == '<' {
                (acc, true)
            } else if ch == '>' {
                acc.push(' ');
                (acc, false)
            } else if !in_tag {
                acc.push(ch);
                (acc, false)
            } else {
                (acc, in_tag)
            }
        })
        .0;

    let trimmed = cleaned
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");

    Ok(if trimmed.len() > 400 {
        format!("{}...", &trimmed[..400])
    } else {
        trimmed
    })
}
