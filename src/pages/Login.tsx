import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

const loginSchema = z.object({
  email: z.string().email('Email invalido'),
  password: z.string().min(1, 'Senha e obrigatoria'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

const Login = () => {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = async (values: LoginFormValues) => {
    setIsSubmitting(true);
    try {
      const { error } = await signIn({ email: values.email, password: values.password });
      if (error) {
        toast({ title: 'Erro ao entrar', description: error, variant: 'destructive' });
        return;
      }
      navigate('/');
    } catch {
      toast({ title: 'Erro ao entrar', description: 'Erro de conexao. Tente novamente.', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0c0d0a] p-4">
      {/* Subtle radial glow */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(207,111,3,0.06)_0%,_transparent_70%)]" />

      <div className="relative w-full max-w-sm fade-in">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <img src="/logo-dark.png" alt="ClickHero" className="h-7 w-auto" />
        </div>

        {/* Card */}
        <div className="bg-[#161714]/80 backdrop-blur-xl border border-white/[0.06] rounded-2xl p-7 shadow-2xl transition-shadow hover:shadow-[0_0_40px_-10px_rgba(207,111,3,0.12)]">
          <div className="text-center mb-6">
            <h1 className="text-xl font-semibold text-[#ecedef] tracking-tight">
              Bem-vindo de volta
            </h1>
            <p className="text-sm text-[#ecedef]/50 mt-1.5">
              Entre na sua conta para continuar
            </p>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 stagger-children">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-[13px] font-medium text-[#ecedef]/70">Email</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="seu@email.com"
                        autoComplete="email"
                        className="h-10 bg-white/[0.04] border-white/[0.08] text-[#ecedef] placeholder:text-[#ecedef]/25 rounded-lg text-[13px] focus:border-primary/50 focus:ring-primary/20 transition-all"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-[13px] font-medium text-[#ecedef]/70">Senha</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="••••••••"
                        autoComplete="current-password"
                        className="h-10 bg-white/[0.04] border-white/[0.08] text-[#ecedef] placeholder:text-[#ecedef]/25 rounded-lg text-[13px] focus:border-primary/50 focus:ring-primary/20 transition-all"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                className="w-full h-10 brand-gradient text-[13px] text-white font-medium rounded-lg hover:opacity-90 transition-all active:scale-[0.98]"
                disabled={isSubmitting}
              >
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Entrar
              </Button>
            </form>
          </Form>
        </div>

        {/* Footer link */}
        <p className="text-[13px] text-[#ecedef]/40 text-center mt-6">
          Nao tem conta?{' '}
          <Link to="/register" className="text-primary hover:text-primary/80 font-medium transition-colors">
            Criar conta
          </Link>
        </p>
      </div>
    </div>
  );
};

export default Login;
