import { Wallet } from 'lucide-react';
import { GoalWizard } from './GoalWizard';

export default function BudgetSmartView() {
  return (
    <div className="h-full overflow-auto">
      <div className="max-w-3xl mx-auto p-6 space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-500/10">
            <Wallet className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Orcamento Smart</h1>
            <p className="text-sm text-muted-foreground">A IA pensa na distribuicao do seu orcamento</p>
          </div>
        </div>

        <GoalWizard />

        <p className="text-xs text-muted-foreground text-center pt-4">
          Projecoes baseadas em historico. Resultados reais podem variar.
        </p>
      </div>
    </div>
  );
}
