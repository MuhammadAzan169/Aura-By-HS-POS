import { Store } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/States';

/** Shown on branch-only screens while the owner is viewing "All shops". */
export function PickBranch({ what }: { what: string }): JSX.Element {
  return (
    <Card>
      <EmptyState
        icon={<Store />}
        title="Pick a branch"
        description={`${what} belongs to one branch. Choose it in the branch switcher at the top.`}
      />
    </Card>
  );
}
