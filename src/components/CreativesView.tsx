import { useState } from "react";
import { Upload, ImagePlus, MoreHorizontal, Eye, TrendingUp, MousePointerClick } from "lucide-react";
import { cn } from "@/lib/utils";

interface Creative {
  id: string;
  name: string;
  type: string;
  status: "active" | "paused" | "review";
  impressions: string;
  ctr: string;
  clicks: string;
  color: string;
}

const mockCreatives: Creative[] = [
  { id: "1", name: "Banner Promo V3", type: "Imagem 1080x1080", status: "active", impressions: "45.2K", ctr: "5.2%", clicks: "2.3K", color: "from-primary/80 to-primary/60" },
  { id: "2", name: "Story Video Sale", type: "Video 1080x1920", status: "active", impressions: "32.1K", ctr: "3.8%", clicks: "1.2K", color: "from-[#0c0d0a] to-[#1a1b18]" },
  { id: "3", name: "Carousel Produtos", type: "Carrossel 1080x1080", status: "review", impressions: "—", ctr: "—", clicks: "—", color: "from-primary/60 to-primary/40" },
  { id: "4", name: "Reels Testimonial", type: "Video 1080x1920", status: "paused", impressions: "18.9K", ctr: "2.1%", clicks: "397", color: "from-[#2a2b28] to-[#1a1b18]" },
  { id: "5", name: "Feed Awareness", type: "Imagem 1200x628", status: "active", impressions: "67.3K", ctr: "4.1%", clicks: "2.8K", color: "from-[#0c0d0a] to-primary/30" },
  { id: "6", name: "Story CTA Direto", type: "Imagem 1080x1920", status: "active", impressions: "21.5K", ctr: "6.3%", clicks: "1.4K", color: "from-primary/70 to-[#0c0d0a]" },
];

const statusMap = {
  active: { label: "Ativo", class: "bg-success/10 text-success" },
  paused: { label: "Pausado", class: "bg-secondary text-muted-foreground" },
  review: { label: "Em revisao", class: "bg-warning/10 text-warning" },
};

const CreativesView = () => {
  const [dragActive, setDragActive] = useState(false);

  return (
    <div className="p-6 lg:p-8 space-y-6 overflow-y-auto h-full">
      <div>
        <h2 className="text-xl font-semibold text-foreground tracking-tight">Criativos</h2>
        <p className="text-[13px] text-muted-foreground mt-0.5">Gerencie e envie criativos para suas campanhas</p>
      </div>

      {/* Upload area */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => { e.preventDefault(); setDragActive(false); }}
        className={cn(
          "border-2 border-dashed rounded-2xl p-10 text-center transition-all cursor-pointer",
          dragActive
            ? "border-primary bg-accent"
            : "border-border/60 hover:border-primary/30 hover:bg-accent/30"
        )}
      >
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Upload className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="text-[13px] font-medium text-foreground">Arraste arquivos ou clique para enviar</p>
            <p className="text-[12px] text-muted-foreground mt-1">PNG, JPG, MP4 ate 30MB</p>
          </div>
        </div>
      </div>

      {/* Creatives grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {mockCreatives.map((c) => {
          const status = statusMap[c.status];
          return (
            <div key={c.id} className="glass-card rounded-2xl overflow-hidden slide-up group">
              {/* Preview */}
              <div className={cn("h-40 bg-gradient-to-br flex items-center justify-center relative", c.color)}>
                <ImagePlus className="w-8 h-8 text-white/40" />
                <button className="absolute top-2.5 right-2.5 w-7 h-7 rounded-lg bg-black/20 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <MoreHorizontal className="w-4 h-4 text-white" />
                </button>
              </div>
              <div className="p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[13px] font-semibold text-foreground">{c.name}</p>
                    <p className="text-[12px] text-muted-foreground">{c.type}</p>
                  </div>
                  <span className={cn("px-2.5 py-1 rounded-full text-[11px] font-medium", status.class)}>
                    {status.label}
                  </span>
                </div>
                {c.status !== "review" && (
                  <div className="grid grid-cols-3 gap-2">
                    <div className="text-center p-2 bg-muted/40 rounded-xl">
                      <Eye className="w-3 h-3 text-muted-foreground mx-auto mb-1" />
                      <p className="text-[12px] font-medium text-foreground">{c.impressions}</p>
                    </div>
                    <div className="text-center p-2 bg-muted/40 rounded-xl">
                      <TrendingUp className="w-3 h-3 text-muted-foreground mx-auto mb-1" />
                      <p className="text-[12px] font-medium text-foreground">{c.ctr}</p>
                    </div>
                    <div className="text-center p-2 bg-muted/40 rounded-xl">
                      <MousePointerClick className="w-3 h-3 text-muted-foreground mx-auto mb-1" />
                      <p className="text-[12px] font-medium text-foreground">{c.clicks}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default CreativesView;
