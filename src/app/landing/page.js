import Link from "next/link";
import { ArrowRight, Bot, Zap, Shield, Sparkles, Core, Cpu, Globe, Infinity as InfinityIcon } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="min-h-screen relative overflow-hidden bg-[var(--bg-deep)]">
      {/* Ambient Background */}
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-soft-light pointer-events-none"></div>
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[var(--nexus-purple)] opacity-30 blur-[120px] rounded-full mix-blend-screen animate-float"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[var(--nexus-pink)] opacity-20 blur-[100px] rounded-full mix-blend-screen animate-pulse-slow"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gradient-to-tr from-[var(--nexus-purple)] to-[var(--nexus-pink)] opacity-10 blur-[150px] rounded-full"></div>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-6 pt-32 pb-24">
        {/* Majestic Hero Section */}
        <div className="text-center mb-24 relative">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-[var(--nexus-pink)]/30 bg-[var(--nexus-pink)]/10 text-[var(--nexus-pink)] text-sm font-medium mb-8 backdrop-blur-md">
            <Sparkles className="w-4 h-4" />
            <span>The Next Generation AI Gateway</span>
          </div>
          
          <h1 className="majestic-title max-w-5xl mx-auto">
            Welcome to the <br />
            <span className="majestic-highlight">NexusAI</span> Experience
          </h1>
          
          <p className="text-xl text-[var(--text-secondary)] max-w-2xl mx-auto mt-6 mb-12 font-light leading-relaxed">
            Harness the power of a unified, high-performance API gateway engineered for unparalleled intelligence, infinite scalability, and seamless integration.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
            <Link 
              href="/login" 
              className="group relative px-8 py-4 bg-white text-black rounded-xl font-semibold overflow-hidden transition-all hover:scale-105 shadow-[0_0_40px_rgba(246,55,236,0.3)]"
            >
              <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-[var(--nexus-pink)] to-[var(--nexus-purple)] opacity-0 group-hover:opacity-10 transition-opacity"></div>
              <span className="relative flex items-center gap-2">
                Enter The Gateway <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </span>
            </Link>
            <Link 
              href="https://github.com/phucphuc2006/nexusai-gateway" 
              target="_blank"
              className="px-8 py-4 rounded-xl font-medium border border-white/10 hover:bg-white/5 transition-all text-white/70 hover:text-white"
            >
              View Documentation
            </Link>
          </div>
        </div>

        {/* Bento Grid Features */}
        <div className="bento-container mt-32">
          {/* Main Feature - Large Col */}
          <div className="bento-item bento-col-2 bento-row-2 flex flex-col justify-between group">
            <div className="w-14 h-14 bg-gradient-to-br from-[var(--nexus-pink)] to-[var(--nexus-purple)] rounded-2xl flex items-center justify-center mb-6 shadow-[0_0_20px_rgba(246,55,236,0.3)]">
              <InfinityIcon className="w-7 h-7 text-white" />
            </div>
            <h3 className="text-2xl font-semibold text-white mb-4">Infinite Scalability</h3>
            <p className="text-[var(--text-secondary)] leading-relaxed">
              Designed from the core to handle massive concurrent requests. NexusAI seamlessly load-balances across elite AI providers without skipping a beat, empowering infinite possibilities.
            </p>
            <div className="mt-8 h-40 rounded-xl bg-black/40 border border-white/5 overflow-hidden relative">
              <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-[var(--nexus-pink)]/20 to-transparent"></div>
              {/* Mock chart/visual */}
              <div className="w-full h-full flex items-end justify-around px-4 pb-2">
                {[40, 70, 45, 90, 65, 80, 100].map((h, i) => (
                  <div key={i} className="w-8 bg-gradient-to-t from-[var(--nexus-pink)] to-[var(--nexus-purple)] rounded-t-sm opacity-80" style={{ height: `${h}%` }}></div>
                ))}
              </div>
            </div>
          </div>

          {/* Model Routing - Tall Col */}
          <div className="bento-item bento-col-1 bento-row-2 group">
            <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center mb-6 text-white group-hover:bg-[var(--nexus-purple)]/20 transition-colors">
              <Cpu className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-semibold text-white mb-3">Model Routing</h3>
            <p className="text-[var(--text-secondary)] flex-grow text-sm mb-6">
              Dynamically route prompts to the most optimal LLMs based on cost, context limits, and reasoning capability.
            </p>
            <div className="space-y-3">
              <div className="p-3 bg-white/5 rounded-lg border border-white/10 text-xs font-mono text-white/80 border-l-2 border-l-[var(--nexus-pink)]">
                &gt; ROUTE: gpt-4o
              </div>
              <div className="p-3 bg-white/5 rounded-lg border border-white/10 text-xs font-mono text-white/50">
                &gt; ROUTE: claude-3-opus
              </div>
              <div className="p-3 bg-white/5 rounded-lg border border-white/10 text-xs font-mono text-white/50">
                &gt; ROUTE: gemini-pro
              </div>
            </div>
          </div>

          /* Security - Square */
          <div className="bento-item bento-col-1 bento-row-1 group">
            <Shield className="w-8 h-8 text-[var(--nexus-pink)] mb-4" />
            <h3 className="text-lg font-semibold text-white mb-2">Zero-Trust Security</h3>
            <p className="text-sm text-[var(--text-secondary)]">Enterprise-grade encryption protecting your API keys and data flows.</p>
          </div>

          /* Global Data - Square */
          <div className="bento-item bento-col-1 bento-row-1 group">
            <Globe className="w-8 h-8 text-[var(--nexus-purple)] mb-4" />
            <h3 className="text-lg font-semibold text-white mb-2">Global Edge Edge</h3>
            <p className="text-sm text-[var(--text-secondary)]">Latency minimized through distributed edge workers worldwide.</p>
          </div>

          {/* Connected Providers - Wide */}
          <div className="bento-item bento-col-2 bento-row-1 flex items-center justify-between group overflow-hidden">
             <div>
                <h3 className="text-xl font-semibold text-white mb-2 flex items-center gap-2"><Zap className="w-5 h-5 text-yellow-400" /> Connected Hub</h3>
                <p className="text-sm text-[var(--text-secondary)]">One unified Gateway. All top-tier providers.</p>
             </div>
             <div className="flex gap-4 opacity-50 group-hover:opacity-100 transition-opacity translate-x-4 group-hover:translate-x-0 duration-500">
                <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center animate-pulse"><Bot className="text-white w-6 h-6"/></div>
                <div className="w-12 h-12 rounded-full bg-black flex items-center justify-center border border-white/20">OAI</div>
                <div className="w-12 h-12 rounded-full bg-[var(--bg-deep)] border border-[var(--nexus-purple)] flex items-center justify-center text-white font-bold">K</div>
             </div>
          </div>
        </div>

      </div>
    </div>
  );
}
