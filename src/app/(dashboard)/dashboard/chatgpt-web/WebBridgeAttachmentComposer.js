"use client";

import { useRef, useState } from "react";
import Badge from "@/shared/components/Badge";
import Button from "@/shared/components/Button";
import Modal from "@/shared/components/Modal";
import {
  formatAttachmentSize,
  getAttachmentKindLabel,
} from "./webBridgeAttachmentUtils";

export default function WebBridgeAttachmentComposer({
  attachments = [],
  disabled = false,
  supportsImageAttachments = false,
  supportsFileAttachments = false,
  supportsConversationAttachments = false,
  attachmentHelpText = "",
  onAddImageFiles,
  onAddGeneralFiles,
  onAddConversationAttachment,
  onRemoveAttachment,
  onAttachmentError,
}) {
  const imageInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const [conversationModalOpen, setConversationModalOpen] = useState(false);
  const [conversationTitle, setConversationTitle] = useState("");
  const [conversationContent, setConversationContent] = useState("");

  const supportsAnyAttachment = supportsImageAttachments || supportsFileAttachments || supportsConversationAttachments;

  const handleSelectImages = async (event) => {
    const files = event.target.files;
    if (!files?.length || typeof onAddImageFiles !== "function") {
      event.target.value = "";
      return;
    }

    try {
      await onAddImageFiles(files);
    } catch (error) {
      onAttachmentError?.(error);
    } finally {
      event.target.value = "";
    }
  };

  const handleSelectFiles = async (event) => {
    const files = event.target.files;
    if (!files?.length || typeof onAddGeneralFiles !== "function") {
      event.target.value = "";
      return;
    }

    try {
      await onAddGeneralFiles(files);
    } catch (error) {
      onAttachmentError?.(error);
    } finally {
      event.target.value = "";
    }
  };

  const handleSaveConversationAttachment = async () => {
    if (typeof onAddConversationAttachment !== "function") {
      return;
    }

    try {
      await onAddConversationAttachment({
        title: conversationTitle,
        content: conversationContent,
      });

      setConversationTitle("");
      setConversationContent("");
      setConversationModalOpen(false);
    } catch (error) {
      onAttachmentError?.(error);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-black/5 bg-black/[0.02] px-3 py-3 dark:border-white/10 dark:bg-white/[0.02]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <p className="text-xs uppercase tracking-[0.18em] text-text-muted">Đính kèm</p>
            <Badge variant={supportsAnyAttachment ? "success" : "warning"} size="sm">
              {supportsAnyAttachment ? "Đã bật" : "Chưa hỗ trợ"}
            </Badge>
          </div>
          <p className="text-sm text-text-muted">
            {attachmentHelpText || (supportsAnyAttachment
              ? "Bạn có thể gửi ảnh, tệp và transcript hội thoại kèm theo prompt."
              : "Provider này hiện chưa hỗ trợ đính kèm thật.")}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          onClick={() => imageInputRef.current?.click()}
          disabled={disabled || !supportsImageAttachments}
        >
          Thêm ảnh
        </Button>
        <Button
          variant="secondary"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || !supportsFileAttachments}
        >
          Thêm tệp
        </Button>
        <Button
          variant="secondary"
          onClick={() => setConversationModalOpen(true)}
          disabled={disabled || !supportsConversationAttachments}
        >
          Đính hội thoại
        </Button>
      </div>

      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleSelectImages}
      />
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleSelectFiles}
      />

      <div className="space-y-2">
        {attachments.length > 0 ? (
          attachments.map((attachment) => (
            <div
              key={attachment.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-black/5 bg-white px-3 py-2 dark:border-white/10 dark:bg-white/5"
            >
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-medium text-text-main">{attachment.name}</p>
                  <Badge variant="default" size="sm">{getAttachmentKindLabel(attachment)}</Badge>
                </div>
                <p className="text-xs text-text-muted">
                  {[attachment.mimeType || "application/octet-stream", formatAttachmentSize(attachment.size)].filter(Boolean).join(" • ")}
                </p>
                {attachment.previewText ? (
                  <p className="line-clamp-2 text-xs text-text-muted">{attachment.previewText}</p>
                ) : null}
              </div>
              <Button
                variant="ghost"
                onClick={() => onRemoveAttachment?.(attachment.id)}
                disabled={disabled}
              >
                Xoá
              </Button>
            </div>
          ))
        ) : (
          <p className="text-sm text-text-muted">Chưa có tệp đính kèm nào.</p>
        )}
      </div>

      <Modal
        isOpen={conversationModalOpen}
        onClose={() => {
          setConversationModalOpen(false);
        }}
        title="Đính hội thoại"
        size="md"
      >
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium text-text-main">Tên tệp hội thoại</label>
            <input
              value={conversationTitle}
              onChange={(event) => setConversationTitle(event.target.value)}
              placeholder="conversation-notes.txt"
              className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm text-text-main outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/10 dark:border-white/10 dark:bg-white/5"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-text-main">Nội dung hội thoại</label>
            <textarea
              value={conversationContent}
              onChange={(event) => setConversationContent(event.target.value)}
              rows={10}
              placeholder="Dán transcript, log chat hoặc nội dung hội thoại cần đính kèm vào đây."
              className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm text-text-main outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/10 dark:border-white/10 dark:bg-white/5"
            />
          </div>
          <div className="flex justify-end gap-3">
            <Button
              variant="ghost"
              onClick={() => setConversationModalOpen(false)}
            >
              Huỷ
            </Button>
            <Button
              onClick={handleSaveConversationAttachment}
              disabled={disabled || !conversationContent.trim()}
            >
              Thêm vào prompt
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
