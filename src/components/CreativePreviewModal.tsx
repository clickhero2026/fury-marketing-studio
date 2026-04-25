import { useEffect, useState } from "react";
import { X, ExternalLink, Image as ImageIcon, Video as VideoIcon, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { humanizeStatus } from "@/lib/meta-labels";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import type { CreativeRow } from "@/hooks/use-campaigns";

interface Props {
  creative: CreativeRow | null;
  onClose: () => void;
}

const AD_FORMATS = [
  { value: "DESKTOP_FEED_STANDARD", label: "Feed Desktop" },
  { value: "MOBILE_FEED_STANDARD", label: "Feed Mobile" },
  { value: "INSTAGRAM_STANDARD", label: "Instagram Feed" },
  { value: "INSTAGRAM_STORY", label: "IG Story" },
  { value: "INSTAGRAM_REELS", label: "Reels" },
];

function cleanName(raw: string | null): string {
  if (!raw) return "Sem nome";
  return raw.replace(/\{\{[^}]+\}\}/g, "").trim() || "Sem nome";
}

export function CreativePreviewModal({ creative, onClose }: Props) {
  const open = creative !== null;
  const [adFormat, setAdFormat] = useState<string>(AD_FORMATS[0].value);
  const [iframeUrl, setIframeUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isVideo = creative?.detected_media_type === "video" || creative?.type === "video";

  useEffect(() => {
    if (!creative) {
      setIframeUrl(null);
      setError(null);
      return;
    }
    let mounted = true;
    setLoading(true);
    setError(null);
    setIframeUrl(null);

    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error("Nao autenticado");

        const url = import.meta.env.VITE_SUPABASE_URL as string;
        const apikey =
          (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ??
          (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string);

        const res = await fetch(`${url}/functions/v1/meta-creative-preview`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            apikey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ creative_id: creative.id, ad_format: adFormat }),
        });
        const body = await res.json();
        if (!mounted) return;
        if (!res.ok || !body.ok) {
          throw new Error(body.error || `HTTP ${res.status}`);
        }
        setIframeUrl(body.iframe_url);
      } catch (e) {
        if (!mounted) return;
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [creative, adFormat]);

  // Link direto pro post se tiver effective_object_story_id
  const externalUrl = creative?.effective_object_story_id
    ? `https://www.facebook.com/${creative.effective_object_story_id.replace("_", "/posts/")}`
    : null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[95vh] overflow-y-auto p-0 gap-0">
        {creative && (
          <>
            <div className="flex items-start justify-between p-4 border-b border-border">
              <div className="min-w-0 flex-1 pr-4">
                <h2 className="text-base font-semibold text-foreground truncate">
                  {cleanName(creative.name)}
                </h2>
                <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                  {isVideo ? <VideoIcon className="h-3 w-3" /> : <ImageIcon className="h-3 w-3" />}
                  <span>{isVideo ? "Video" : "Imagem"}</span>
                  {creative.campaign?.name && (
                    <>
                      <span className="opacity-50">·</span>
                      <span className="truncate">{creative.campaign.name}</span>
                    </>
                  )}
                  <span className={cn(
                    "ml-auto rounded-full border px-2 py-0.5 text-[10px] font-medium",
                    creative.status === "ACTIVE"
                      ? "border-emerald-600/20 bg-emerald-500/10 text-emerald-500"
                      : "border-border bg-secondary text-muted-foreground"
                  )}>
                    {humanizeStatus(creative.status)}
                  </span>
                </div>
              </div>
              <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-secondary" aria-label="Fechar">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Format selector */}
            <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-card/50">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Formato:
              </span>
              <div className="flex flex-wrap gap-1">
                {AD_FORMATS.map((f) => (
                  <button
                    key={f.value}
                    onClick={() => setAdFormat(f.value)}
                    className={cn(
                      "rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors",
                      adFormat === f.value
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-secondary"
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Preview area — iframe da Meta Ad Preview API */}
            <div className="bg-black/40 p-4 flex items-center justify-center min-h-[500px]">
              {loading ? (
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin" />
                  <span className="text-xs">Carregando preview da Meta...</span>
                </div>
              ) : error ? (
                <div className="text-center text-muted-foreground py-8 max-w-md">
                  <AlertCircle className="h-8 w-8 mx-auto mb-2 text-red-400" />
                  <p className="text-sm font-medium text-foreground mb-1">Falha ao carregar preview</p>
                  <p className="text-xs opacity-70">{error}</p>
                  {externalUrl && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={() => window.open(externalUrl, "_blank", "noopener,noreferrer")}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Abrir no Facebook
                    </Button>
                  )}
                </div>
              ) : iframeUrl ? (
                <iframe
                  src={iframeUrl}
                  className="w-full max-w-[540px] h-[600px] rounded-lg border-0 bg-white"
                  allow="encrypted-media; autoplay"
                  title={cleanName(creative.name)}
                />
              ) : (
                <div className="text-center text-muted-foreground py-12">
                  <ImageIcon className="h-10 w-10 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">Sem preview disponivel</p>
                </div>
              )}
            </div>

            {/* Detalhes textuais */}
            <div className="p-4 space-y-3 border-t border-border">
              {creative.headline && creative.headline.trim() && (
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">
                    Titulo
                  </div>
                  <p className="text-sm text-foreground">{creative.headline}</p>
                </div>
              )}
              {creative.text && creative.text.trim() && (
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">
                    Corpo
                  </div>
                  <p className="text-sm text-foreground whitespace-pre-line">{creative.text}</p>
                </div>
              )}
              {creative.call_to_action && (
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">
                    Call to Action
                  </div>
                  <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                    {creative.call_to_action}
                  </span>
                </div>
              )}
              <div className="text-[10px] text-muted-foreground/60 pt-2 border-t border-border/40 font-mono">
                Creative ID: {creative.external_id}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
