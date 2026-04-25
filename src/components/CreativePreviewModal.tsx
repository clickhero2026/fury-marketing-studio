import { X, ExternalLink, Image as ImageIcon, Video as VideoIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { humanizeStatus } from "@/lib/meta-labels";
import { cn } from "@/lib/utils";
import type { CreativeRow } from "@/hooks/use-campaigns";

interface Props {
  creative: CreativeRow | null;
  onClose: () => void;
}

function cleanName(raw: string | null): string {
  if (!raw) return "Sem nome";
  return raw.replace(/\{\{[^}]+\}\}/g, "").trim() || "Sem nome";
}

export function CreativePreviewModal({ creative, onClose }: Props) {
  const open = creative !== null;

  const isVideo = creative?.detected_media_type === "video" || creative?.type === "video";
  const previewUrl = creative?.thumbnail_url || creative?.image_url || null;

  // Embed Facebook plugin para video — funciona se a page do post for publica
  const embedUrl = creative?.effective_object_story_id
    ? `https://www.facebook.com/plugins/post.php?href=${encodeURIComponent(
        `https://www.facebook.com/${creative.effective_object_story_id.replace('_', '/posts/')}`
      )}&show_text=true&width=500`
    : null;

  // Link direto pro post (abre em nova aba)
  const externalUrl = creative?.effective_object_story_id
    ? `https://www.facebook.com/${creative.effective_object_story_id.replace('_', '/posts/')}`
    : null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-0 gap-0">
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
              <button
                onClick={onClose}
                className="rounded-lg p-1.5 hover:bg-secondary"
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Preview area */}
            <div className="bg-black/40 p-4 flex items-center justify-center min-h-[300px]">
              {isVideo && embedUrl ? (
                <iframe
                  src={embedUrl}
                  className="w-full h-[500px] rounded-lg border-0"
                  allow="encrypted-media"
                  scrolling="no"
                  title={cleanName(creative.name)}
                />
              ) : previewUrl ? (
                <img
                  src={previewUrl}
                  alt={cleanName(creative.name)}
                  className="max-w-full max-h-[500px] object-contain rounded-lg"
                />
              ) : (
                <div className="text-center text-muted-foreground py-12">
                  <ImageIcon className="h-10 w-10 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">Sem preview disponivel</p>
                  <p className="text-xs opacity-60 mt-1">
                    {isVideo
                      ? "Video sem thumbnail e sem post publico — abra na Meta Ads Manager"
                      : "Criativo dinamico (sem image_url unico)"}
                  </p>
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

              <div className="flex flex-wrap gap-2 pt-2">
                {externalUrl && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(externalUrl, '_blank', 'noopener,noreferrer')}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Abrir post no Facebook
                  </Button>
                )}
                {creative.video_id && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(`https://business.facebook.com/ads/manager/manage/ads?act=${creative.ad_account_id?.replace('act_', '')}`, '_blank', 'noopener,noreferrer')}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Abrir no Ads Manager
                  </Button>
                )}
              </div>

              <div className="text-[10px] text-muted-foreground/60 pt-2 border-t border-border/40 font-mono">
                ID: {creative.external_id}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
