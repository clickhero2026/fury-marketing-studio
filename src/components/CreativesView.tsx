import { useState } from "react";
import { ImagePlus, MoreHorizontal, Loader2, Video as VideoIcon, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCreatives, type CreativeRow } from "@/hooks/use-campaigns";
import { humanizeStatus } from "@/lib/meta-labels";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/PageHeader";

// Subcomponente com error state proprio — evita DOM manipulation imperativa
function CreativeImage({ src, alt, isVideo }: { src: string | null; alt: string; isVideo: boolean }) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return isVideo ? (
      <VideoIcon className="h-8 w-8 text-muted-foreground/50" strokeWidth={1.5} />
    ) : (
      <ImagePlus className="h-8 w-8 text-muted-foreground/50" strokeWidth={1.5} />
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
  if (raw === "ACTIVE") return "border-emerald-600/10 bg-emerald-50 text-emerald-700";
  if (raw === "PAUSED" || raw === "DELETED" || raw === "ARCHIVED") return "border-border bg-secondary text-muted-foreground";
  if (raw === "DISAPPROVED" || raw === "WITH_ISSUES") return "border-red-600/10 bg-red-50 text-red-700";
  return "border-amber-600/10 bg-amber-50 text-amber-700";
}

function CreativeCard({ c }: { c: CreativeRow }) {
  const isVideo = c.detected_media_type === "video" || c.type === "video";
  const subtitle = (c.headline && c.headline.trim()) || c.detected_media_type || "—";
  const displayName = (c.name && c.name.trim()) || "Sem nome";

  return (
    <div className="group overflow-hidden rounded-xl border border-border/60 bg-card shadow-e1 transition-all duration-base ease-smooth hover:-translate-y-0.5 hover:shadow-e3 animate-slide-up">
      <div className="relative flex h-40 items-center justify-center overflow-hidden bg-gradient-to-br from-gray-100 to-gray-200">
        <CreativeImage src={c.image_url} alt={displayName} isVideo={isVideo} />
        <button
          type="button"
          aria-label={`Acoes do criativo ${displayName}`}
          className="absolute right-2.5 top-2.5 flex h-7 w-7 items-center justify-center rounded-lg bg-black/40 opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100"
        >
          <MoreHorizontal className="h-4 w-4 text-white" />
        </button>
      </div>
      <div className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold text-foreground">{displayName}</p>
            <p className="truncate text-[12px] text-muted-foreground">{subtitle}</p>
          </div>
          <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium", statusBadgeClass(c.status))}>
            {humanizeStatus(c.status)}
          </span>
        </div>
        {c.text && c.text.trim() && (
          <p className="line-clamp-2 text-[12px] text-muted-foreground">{c.text}</p>
        )}
        {c.call_to_action && (
          <div className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">{c.call_to_action}</div>
        )}
      </div>
    </div>
  );
}

const CreativesView = () => {
  const { data: creatives = [], isLoading, isError, error, refetch } = useCreatives();

  return (
    <div className="mx-auto h-full max-w-[1600px] animate-fade-in space-y-6 overflow-y-auto p-4 md:p-6 xl:p-8">
      <PageHeader
        title="Criativos"
        description="Criativos sincronizados das suas campanhas Meta"
        badge={
          !isLoading && !isError ? (
            <span className="rounded-full border border-border bg-secondary px-2.5 py-0.5 font-mono text-xs font-medium text-muted-foreground tabular-nums">
              {creatives.length}
            </span>
          ) : null
        }
      />

      {isError ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-border/60 bg-card p-12 text-center shadow-e1">
          <AlertCircle className="h-6 w-6 text-red-600" />
          <p className="text-[13px] text-muted-foreground">
            Falha ao carregar criativos{error?.message ? `: ${error.message}` : ""}
          </p>
          <Button size="sm" variant="outline" onClick={() => refetch()}>
            Tentar novamente
          </Button>
        </div>
      ) : isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : creatives.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/50 p-12 text-center">
          <ImagePlus className="mx-auto mb-3 h-8 w-8 text-muted-foreground/60" />
          <p className="text-[13px] text-muted-foreground">
            Nenhum criativo sincronizado. Va em Integracoes e clique em Sincronizar.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {creatives.map((c) => (
            <CreativeCard key={c.id} c={c} />
          ))}
        </div>
      )}
    </div>
  );
};

export default CreativesView;
