import { useState, useRef, useEffect } from "react";
import { Send, Paperclip, Sparkles, Square, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useChat } from "@/hooks/use-chat";

const suggestions = [
  "Qual o desempenho das minhas campanhas nos ultimos 7 dias?",
  "Qual campanha tem o melhor ROAS?",
  "Compare esta semana com a anterior",
  "Me de sugestoes para reduzir CPC",
];

const ChatView = () => {
  const {
    messages,
    isStreaming,
    status,
    sendMessage,
    stopStreaming,
    newConversation,
    loadProactiveInsights,
  } = useChat();

  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const proactiveLoaded = useRef(false);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  // B4: Carrega insights proativos uma vez por sessao do browser (sobrevive remount do ChatView)
  useEffect(() => {
    const SESSION_KEY = 'fury_proactive_loaded';
    if (proactiveLoaded.current) return;
    if (sessionStorage.getItem(SESSION_KEY) === '1') {
      proactiveLoaded.current = true;
      return;
    }
    proactiveLoaded.current = true;
    sessionStorage.setItem(SESSION_KEY, '1');
    loadProactiveInsights();
  }, [loadProactiveInsights]);

  const handleSend = () => {
    if (!input.trim() || isStreaming) return;
    sendMessage(input);
    setInput("");
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    if (isStreaming) return;
    sendMessage(suggestion);
  };

  // Simple markdown-ish rendering: bold, tables, lists
  const renderContent = (content: string) => {
    if (!content) return null;

    const lines = content.split('\n');
    const elements: React.ReactNode[] = [];
    let tableRows: string[][] = [];
    let inTable = false;

    const processInline = (text: string): React.ReactNode => {
      // Bold
      const parts = text.split(/\*\*(.*?)\*\*/g);
      return parts.map((part, i) =>
        i % 2 === 1 ? <strong key={i} className="font-semibold">{part}</strong> : part
      );
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Table row
      if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
        const cells = line.split('|').filter(c => c.trim()).map(c => c.trim());
        // Skip separator rows (|---|---|)
        if (cells.every(c => /^[-:]+$/.test(c))) {
          continue;
        }
        tableRows.push(cells);
        inTable = true;
        continue;
      }

      // End of table
      if (inTable && tableRows.length > 0) {
        const headers = tableRows[0];
        const rows = tableRows.slice(1);
        elements.push(
          <div key={`table-${i}`} className="overflow-x-auto my-2">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-white/10">
                  {headers.map((h, hi) => (
                    <th key={hi} className="text-left px-2 py-1.5 text-white/50 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, ri) => (
                  <tr key={ri} className="border-b border-white/[0.04]">
                    {row.map((cell, ci) => (
                      <td key={ci} className="px-2 py-1.5 text-white/70">{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        tableRows = [];
        inTable = false;
      }

      // Headers
      if (line.startsWith('## ')) {
        elements.push(<h3 key={i} className="text-sm font-semibold text-white/90 mt-3 mb-1">{line.slice(3)}</h3>);
        continue;
      }

      // List items
      if (line.match(/^[-*] /)) {
        elements.push(
          <div key={i} className="flex gap-2 ml-1">
            <span className="text-primary mt-0.5">•</span>
            <span>{processInline(line.slice(2))}</span>
          </div>
        );
        continue;
      }

      // Numbered list
      if (line.match(/^\d+\. /)) {
        const match = line.match(/^(\d+)\. (.*)$/);
        if (match) {
          elements.push(
            <div key={i} className="flex gap-2 ml-1">
              <span className="text-primary/70 font-mono text-xs mt-0.5">{match[1]}.</span>
              <span>{processInline(match[2])}</span>
            </div>
          );
          continue;
        }
      }

      // Empty line
      if (!line.trim()) {
        elements.push(<div key={i} className="h-1.5" />);
        continue;
      }

      // Regular text
      elements.push(<p key={i}>{processInline(line)}</p>);
    }

    // Flush remaining table
    if (inTable && tableRows.length > 0) {
      const headers = tableRows[0];
      const rows = tableRows.slice(1);
      elements.push(
        <div key="table-end" className="overflow-x-auto my-2">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-white/10">
                {headers.map((h, hi) => (
                  <th key={hi} className="text-left px-2 py-1.5 text-white/50 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri} className="border-b border-white/[0.04]">
                  {row.map((cell, ci) => (
                    <td key={ci} className="px-2 py-1.5 text-white/70">{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    return elements;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-8 space-y-4">
        {/* Welcome + Suggestions (only when no messages) */}
        {messages.length === 0 && (
          <div className="max-w-2xl mx-auto fade-in">
            <div className="text-center mb-8">
              <div className="w-12 h-12 rounded-2xl brand-gradient flex items-center justify-center mx-auto mb-4">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <h2 className="text-lg font-semibold text-white/90 mb-1">ClickHero AI</h2>
              <p className="text-sm text-white/40">
                Seu assistente de Meta Ads com dados reais das suas campanhas
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => handleSuggestionClick(s)}
                  className="text-left p-3.5 rounded-xl border border-border/60 hover:border-primary/30 hover:bg-accent/50 text-[13px] text-muted-foreground transition-all"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Message bubbles — oculta mensagens [SISTEMA] do usuario */}
        {messages.filter((m) => !(m.role === 'user' && m.content.startsWith('[SISTEMA]'))).map((msg) => (
          <div
            key={msg.id}
            className={cn(
              "max-w-2xl mx-auto slide-up",
              msg.role === "user" ? "flex justify-end" : ""
            )}
          >
            <div
              className={cn(
                "px-4 py-3 rounded-2xl text-[13px] leading-relaxed",
                msg.role === "user"
                  ? "chat-gradient text-white rounded-br-md max-w-[80%] whitespace-pre-wrap"
                  : "bg-chat-ai text-chat-ai-foreground rounded-bl-md space-y-0.5"
              )}
            >
              {msg.role === 'assistant' ? renderContent(msg.content) : msg.content}
              {msg.isStreaming && !msg.content && (
                <div className="inline-flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-pulse-soft" />
                  <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-pulse-soft [animation-delay:0.3s]" />
                  <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-pulse-soft [animation-delay:0.6s]" />
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Status indicator (e.g., "Buscando dados...") */}
        {status && (
          <div className="max-w-2xl mx-auto">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/5 border border-primary/10 text-xs text-primary/70">
              <Search className="w-3 h-3 animate-pulse" />
              {status}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="border-t border-border/60 bg-background p-4">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-end gap-2 bg-card border border-border/60 rounded-2xl p-2 focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/10 transition-all shadow-sm">
            <button className="p-2 text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-muted/50">
              <Paperclip className="w-[18px] h-[18px]" />
            </button>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Pergunte sobre suas campanhas..."
              rows={1}
              className="flex-1 resize-none bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none py-2 max-h-32"
              disabled={isStreaming}
            />
            {isStreaming ? (
              <button
                onClick={stopStreaming}
                className="p-2 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all"
              >
                <Square className="w-[18px] h-[18px]" />
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!input.trim()}
                className={cn(
                  "p-2 rounded-xl transition-all",
                  input.trim()
                    ? "brand-gradient text-white shadow-sm"
                    : "text-muted-foreground/40"
                )}
              >
                <Send className="w-[18px] h-[18px]" />
              </button>
            )}
          </div>
          <div className="flex items-center justify-between mt-2.5">
            {messages.length > 0 && (
              <button
                onClick={newConversation}
                className="text-[11px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
              >
                Nova conversa
              </button>
            )}
            <p className="text-[11px] text-muted-foreground/50 flex items-center gap-1 ml-auto">
              <Sparkles className="w-3 h-3" />
              GPT-4o + dados reais Meta Ads
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatView;
