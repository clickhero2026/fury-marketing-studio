import { useState } from "react";
import { ImagePlus, MoreHorizontal, Loader2, Video as VideoIcon, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCreatives, type CreativeRow } from "@/hooks/use-campaigns";
import { humanizeStatus } from "@/lib/meta-labels";
import { Button } from "@/components/ui/button";

// Subcomponente com error state proprio — evita DOM manipulation imperativa
function CreativeImage({ src, alt, isVideo }: { src: string | null; alt: string; isVideo: boolean }) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return isVideo ? (
      <VideoIcon className="w-8 h-8 text-white/40" />
    ) : (
      <ImagePlus className="w-8 h-8 text-white/40" />
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      className="w-full h-full object-cover"
      onError={() => setFailed(true)}
    />
  );
}

function statusBadgeClass(raw: string | null): string {
  if (raw === "ACTIVE") return "bg-success/10 text-success";
  if (raw === "PAUSED" || raw === "DELETED" || raw === "ARCHIVED") return "bg-secondary text-muted-foreground";
  if (raw === "DISAPPROVED" || raw === "WITH_ISSUES") return "bg-danger/10 text-danger";
  return "bg-warning/10 text-warning";
}

function CreativeCard({ c }: { c: CreativeRow }) {
  const isVideo = c.detected_media_type === "video" || c.type === "video";
  const subtitle = (c.headline && c.headline.trim()) || c.detected_media_type || "—";
  const displayName = (c.name && c.name.trim()) || "Sem nome";

  return (
    <div className="glass-card rounded-2xl overflow-hidden slide-up group">
      <div className="h-40 bg-gradient-to-br from-[#1a1b18] to-[#0c0d0a] flex items-center justify-center relative overflow-hidden">
        <CreativeImage src={c.image_url} alt={displayName} isVideo={isVideo} />
        <button
          type="button"
          aria-label={`Acoes do criativo ${displayName}`}
          className="absolute top-2.5 right-2.5 w-7 h-7 rounded-lg bg-black/40 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <MoreHorizontal className="w-4 h-4 text-white" />
        </button>
      </div>
      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-foreground truncate">{displayName}</p>
            <p className="text-[12px] text-muted-foreground truncate">{subtitle}</p>
          </div>
          <span className={cn("px-2.5 py-1 rounded-full text-[11px] font-medium shrink-0", statusBadgeClass(c.status))}>
            {humanizeStatus(c.status)}
          </span>
        </div>
        {c.text && c.text.trim() && (
          <p className="text-[12px] text-muted-foreground line-clamp-2">{c.text}</p>
        )}
        {c.call_to_action && (
          <div className="text-[11px] text-primary font-medium">{c.call_to_action}</div>
        )}
      </div>
    </div>
  );
}

const CreativesView = () => {
  const { data: creatives = [], isLoading, isError, error, refetch } = useCreatives();

  return (
    <div className="p-6 lg:p-8 space-y-6 overflow-y-auto h-full">
      <div>
        <h2 className="text-xl font-semibold text-foreground tracking-tight">Criativos</h2>
        <p className="text-[13px] text-muted-foreground mt-0.5">Criativos sincronizados das suas campanhas Meta</p>
      </div>

      {isError ? (
        <div className="glass-card rounded-2xl p-12 text-center flex flex-col items-center gap-3">
          <AlertCircle className="w-6 h-6 text-danger" />
          <p className="text-[13px] text-muted-foreground">
            Falha ao carregar criativos{error?.message ? `: ${error.message}` : ""}
          </p>
          <Button size="sm" variant="outline" onClick={() => refetch()}>
            Tentar novamente
          </Button>
        </div>
      ) : isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : creatives.length === 0 ? (
        <div className="glass-card rounded-2xl p-12 text-center">
          <p className="text-[13px] text-muted-foreground">
            Nenhum criativo sincronizado. Va em Integracoes e clique em Sincronizar.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {creatives.map((c) => (
            <CreativeCard key={c.id} c={c} />
          ))}
        </div>
      )}
    </div>
  );
};

export default CreativesView;
