import { useState, useRef, useEffect } from "react";
import { Send, Paperclip, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

const suggestions = [
  "Qual o desempenho das minhas campanhas hoje?",
  "Analise o CPA da campanha de conversao",
  "Compare os criativos da ultima semana",
  "Sugira otimizacoes para reduzir CPC",
];

const mockResponses: Record<string, string> = {
  default: `Ola! Sou seu assistente de **Meta Ads**. Posso ajudar com:

- **Relatorios** de campanhas em tempo real
- **Analise** de metricas (CPA, ROAS, CTR)
- **Upload** e gestao de criativos
- **Otimizacoes** baseadas em dados

Como posso ajudar hoje?`,
  desempenho: `**Resumo do Desempenho — Hoje**

| Metrica | Valor | Variacao |
|---------|-------|----------|
| Impressoes | 45.2K | +12% |
| Cliques | 1.8K | +8% |
| CTR | 3.98% | +0.3% |
| CPC | R$ 1.42 | -5% |
| Conversoes | 127 | +15% |
| ROAS | 4.2x | +0.3x |

As campanhas estao performando **acima da media**. O criativo "Banner Promo V3" e o destaque com CTR de 5.2%.`,
  cpa: `**Analise de CPA — Campanha de Conversao**

O CPA atual e **R$ 28.50**, uma reducao de **12%** em relacao a semana anterior.

**Top 3 Ad Sets por CPA:**
1. Lookalike 1% — R$ 22.30
2. Interesse Amplo — R$ 26.80
3. Retargeting 7d — R$ 31.20

**Recomendacao:** Aumente o budget do Lookalike 1% em 20% para escalar com eficiencia.`,
};

const ChatView = () => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: mockResponses.default,
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const getResponse = (text: string): string => {
    const lower = text.toLowerCase();
    if (lower.includes("desempenho") || lower.includes("performance")) return mockResponses.desempenho;
    if (lower.includes("cpa") || lower.includes("conversao")) return mockResponses.cpa;
    return `Entendi sua solicitacao sobre "${text}". Em breve, com a integracao da API de agentes, poderei trazer dados em tempo real da Meta. Por enquanto, posso mostrar analises do **Dashboard** ou ajudar com **upload de criativos**.`;
  };

  const handleSend = () => {
    if (!input.trim()) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsTyping(true);

    typingTimeoutRef.current = setTimeout(() => {
      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: getResponse(userMsg.content),
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, aiMsg]);
      setIsTyping(false);
      typingTimeoutRef.current = null;
    }, 1200);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-8 space-y-4">
        {/* Suggestions (only on initial state) */}
        {messages.length === 1 && (
          <div className="max-w-2xl mx-auto mb-8 fade-in">
            <div className="grid grid-cols-2 gap-2.5">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => setInput(s)}
                  className="text-left p-3.5 rounded-xl border border-border/60 hover:border-primary/30 hover:bg-accent/50 text-[13px] text-muted-foreground transition-all"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Message bubbles */}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              "max-w-2xl mx-auto slide-up",
              msg.role === "user" ? "flex justify-end" : ""
            )}
          >
            <div
              className={cn(
                "px-4 py-3 rounded-2xl text-[13px] leading-relaxed whitespace-pre-wrap",
                msg.role === "user"
                  ? "chat-gradient text-white rounded-br-md max-w-[80%]"
                  : "bg-chat-ai text-chat-ai-foreground rounded-bl-md"
              )}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {/* Typing indicator */}
        {isTyping && (
          <div className="max-w-2xl mx-auto">
            <div className="bg-chat-ai text-chat-ai-foreground px-4 py-3 rounded-2xl rounded-bl-md inline-flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-pulse-soft" />
              <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-pulse-soft [animation-delay:0.3s]" />
              <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-pulse-soft [animation-delay:0.6s]" />
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
            />
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
          </div>
          <p className="text-[11px] text-muted-foreground/50 text-center mt-2.5 flex items-center justify-center gap-1">
            <Sparkles className="w-3 h-3" />
            Powered by AI
          </p>
        </div>
      </div>
    </div>
  );
};

export default ChatView;
