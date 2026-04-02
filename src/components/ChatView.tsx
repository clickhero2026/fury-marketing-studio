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
  "📊 Qual o desempenho das minhas campanhas hoje?",
  "🎯 Analise o CPA da campanha de conversão",
  "📈 Compare os criativos da última semana",
  "💡 Sugira otimizações para reduzir CPC",
];

const mockResponses: Record<string, string> = {
  default: `Olá! 👋 Sou seu assistente de **Meta Ads**. Posso ajudar com:

- 📊 **Relatórios** de campanhas em tempo real
- 🎯 **Análise** de métricas (CPA, ROAS, CTR)
- 🖼️ **Upload** e gestão de criativos
- 💡 **Otimizações** baseadas em dados

Como posso ajudar hoje?`,
  desempenho: `📊 **Resumo do Desempenho — Hoje**

| Métrica | Valor | Variação |
|---------|-------|----------|
| Impressões | 45.2K | +12% |
| Cliques | 1.8K | +8% |
| CTR | 3.98% | +0.3% |
| CPC | R$ 1.42 | -5% |
| Conversões | 127 | +15% |
| ROAS | 4.2x | +0.3x |

✅ As campanhas estão performando **acima da média**. O criativo "Banner Promo V3" é o destaque com CTR de 5.2%.`,
  cpa: `🎯 **Análise de CPA — Campanha de Conversão**

O CPA atual é **R$ 28.50**, uma redução de **12%** em relação à semana anterior.

**Top 3 Ad Sets por CPA:**
1. 🥇 Lookalike 1% — R$ 22.30
2. 🥈 Interesse Amplo — R$ 26.80
3. 🥉 Retargeting 7d — R$ 31.20

💡 **Recomendação:** Aumente o budget do Lookalike 1% em 20% para escalar com eficiência.`,
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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const getResponse = (text: string): string => {
    const lower = text.toLowerCase();
    if (lower.includes("desempenho") || lower.includes("performance")) return mockResponses.desempenho;
    if (lower.includes("cpa") || lower.includes("conversão")) return mockResponses.cpa;
    return `Entendi sua solicitação sobre "${text}". Em breve, com a integração da API de agentes, poderei trazer dados em tempo real da Meta. Por enquanto, posso mostrar análises do **Dashboard** ou ajudar com **upload de criativos**.`;
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

    setTimeout(() => {
      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: getResponse(userMsg.content),
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, aiMsg]);
      setIsTyping(false);
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
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
        {messages.length === 1 && (
          <div className="max-w-2xl mx-auto mb-6 fade-in">
            <div className="grid grid-cols-2 gap-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    setInput(s.replace(/^[^\s]+\s/, ""));
                  }}
                  className="text-left p-3 rounded-xl border border-border hover:border-primary/30 hover:bg-accent/50 text-sm text-muted-foreground transition-all"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

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
                "px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap",
                msg.role === "user"
                  ? "bg-chat-user text-chat-user-foreground rounded-br-md max-w-[80%]"
                  : "bg-chat-ai text-chat-ai-foreground rounded-bl-md"
              )}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {isTyping && (
          <div className="max-w-2xl mx-auto">
            <div className="bg-chat-ai text-chat-ai-foreground px-4 py-3 rounded-2xl rounded-bl-md inline-flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-pulse-soft" />
              <div className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-pulse-soft [animation-delay:0.3s]" />
              <div className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-pulse-soft [animation-delay:0.6s]" />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-border bg-card/50 backdrop-blur-sm p-4">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-end gap-2 bg-background border border-border rounded-2xl p-2 focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/10 transition-all">
            <button className="p-2 text-muted-foreground hover:text-foreground transition-colors">
              <Paperclip className="w-5 h-5" />
            </button>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Pergunte sobre suas campanhas..."
              rows={1}
              className="flex-1 resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none py-2 max-h-32"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className={cn(
                "p-2 rounded-xl transition-all",
                input.trim()
                  ? "chat-gradient text-primary-foreground"
                  : "text-muted-foreground"
              )}
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
          <p className="text-xs text-muted-foreground text-center mt-2 flex items-center justify-center gap-1">
            <Sparkles className="w-3 h-3" />
            Powered by AI — Integração com API de agentes em breve
          </p>
        </div>
      </div>
    </div>
  );
};

export default ChatView;
