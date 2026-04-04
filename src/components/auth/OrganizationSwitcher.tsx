import { useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Building2, Loader2 } from 'lucide-react';

export function OrganizationSwitcher() {
  const { organization, organizations, switchOrganization } = useAuth();
  const [isSwitching, setIsSwitching] = useState(false);

  if (!organization || organizations.length === 0) return null;

  // Single org — just show the name, no dropdown
  if (organizations.length === 1) {
    return (
      <div className="flex items-center gap-2 px-2 py-1.5">
        <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="text-sm font-medium truncate">{organization.name}</span>
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">
          {organization.plan}
        </Badge>
      </div>
    );
  }

  const handleSwitch = async (orgId: string) => {
    if (orgId === organization.id) return;
    setIsSwitching(true);
    try {
      const { error } = await switchOrganization(orgId);
      if (error) {
        // Toast is already shown inside switchOrganization
        // Select will revert to previous value since state didn't change
      }
    } finally {
      setIsSwitching(false);
    }
  };

  return (
    <div className="relative">
      {isSwitching && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-10 rounded-md">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      )}
      <Select value={organization.id} onValueChange={handleSwitch} disabled={isSwitching}>
        <SelectTrigger className="w-full border-none bg-transparent hover:bg-accent h-auto py-1.5 px-2">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
            <SelectValue />
          </div>
        </SelectTrigger>
        <SelectContent>
          {organizations.map((org) => (
            <SelectItem key={org.id} value={org.id}>
              <div className="flex items-center gap-2">
                <span className="truncate">{org.name}</span>
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  {org.plan}
                </Badge>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
