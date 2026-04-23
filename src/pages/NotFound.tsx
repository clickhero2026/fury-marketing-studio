import { useLocation } from "react-router-dom";
import { useEffect } from "react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground p-4 relative overflow-hidden">
      {/* Ambient Glows */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-primary/5 rounded-full blur-[120px] pointer-events-none" />

      <div className="relative text-center bento-card max-w-sm w-full py-12">
        <h1 className="text-6xl font-black tracking-tighter text-primary mb-4">404</h1>
        <p className="text-xl font-bold text-foreground mb-2">Página não encontrada</p>
        <p className="text-sm text-muted-foreground mb-8">
          O caminho que você está procurando não existe ou foi movido.
        </p>
        <a 
          href="/" 
          className="inline-flex h-11 items-center justify-center px-8 bg-primary text-primary-foreground font-bold rounded-xl hover:opacity-90 shadow-lg shadow-primary/20 transition-all active:scale-[0.98]"
        >
          Voltar ao Início
        </a>
      </div>
    </div>
  );
};

export default NotFound;
