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

const registerSchema = z.object({
  displayName: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  email: z.string().email('Email invalido'),
  password: z.string().min(8, 'Senha deve ter pelo menos 8 caracteres'),
  confirmPassword: z.string(),
  organizationName: z.string().min(2, 'Nome da empresa deve ter pelo menos 2 caracteres'),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'As senhas nao conferem',
  path: ['confirmPassword'],
});

type RegisterFormValues = z.infer<typeof registerSchema>;

const Register = () => {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      displayName: '',
      email: '',
      password: '',
      confirmPassword: '',
      organizationName: '',
    },
  });

  const onSubmit = async (values: RegisterFormValues) => {
    setIsSubmitting(true);
    try {
      const { error } = await signUp({
        email: values.email,
        password: values.password,
        displayName: values.displayName,
        organizationName: values.organizationName,
      });

      if (error) {
        toast({ title: 'Erro ao criar conta', description: error, variant: 'destructive' });
        return;
      }

      toast({ title: 'Conta criada com sucesso!', description: 'Verifique seu email para confirmar o cadastro.' });
      navigate('/login');
    } catch {
      toast({ title: 'Erro ao criar conta', description: 'Erro de conexao. Tente novamente.', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClass = "h-11 bg-white/[0.04] border-white/[0.08] text-[#ecedef] placeholder:text-[#ecedef]/25 rounded-xl focus:border-primary/50 focus:ring-primary/20 transition-all";

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0c0d0a] p-4">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(207,111,3,0.06)_0%,_transparent_70%)]" />

      <div className="relative w-full max-w-sm fade-in">
        {/* Logo */}
        <div className="flex justify-center mb-10">
          <img src="/logo-dark.png" alt="ClickHero" className="h-9 w-auto" />
        </div>

        {/* Card */}
        <div className="bg-[#161714]/80 backdrop-blur-xl border border-white/[0.06] rounded-2xl p-8 shadow-2xl">
          <div className="text-center mb-7">
            <h1 className="text-xl font-semibold text-[#ecedef] tracking-tight">
              Criar conta
            </h1>
            <p className="text-sm text-[#ecedef]/50 mt-1.5">
              Configure sua conta e organizacao
            </p>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="displayName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-[13px] font-medium text-[#ecedef]/70">Seu nome</FormLabel>
                    <FormControl>
                      <Input placeholder="Joao Silva" autoComplete="name" className={inputClass} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-[13px] font-medium text-[#ecedef]/70">Email</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="seu@email.com" autoComplete="email" className={inputClass} {...field} />
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
                      <Input type="password" placeholder="Minimo 8 caracteres" autoComplete="new-password" className={inputClass} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-[13px] font-medium text-[#ecedef]/70">Confirmar senha</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="Repita a senha" autoComplete="new-password" className={inputClass} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="border-t border-white/[0.06] pt-4">
                <FormField
                  control={form.control}
                  name="organizationName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-[13px] font-medium text-[#ecedef]/70">Empresa / Organizacao</FormLabel>
                      <FormControl>
                        <Input placeholder="Minha Agencia" className={inputClass} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <Button
                type="submit"
                className="w-full h-11 brand-gradient text-white font-medium rounded-xl hover:opacity-90 transition-all active:scale-[0.98] mt-2"
                disabled={isSubmitting}
              >
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Criar conta
              </Button>
            </form>
          </Form>
        </div>

        <p className="text-[13px] text-[#ecedef]/40 text-center mt-6">
          Ja tem conta?{' '}
          <Link to="/login" className="text-primary hover:text-primary/80 font-medium transition-colors">
            Entrar
          </Link>
        </p>
      </div>
    </div>
  );
};

export default Register;
