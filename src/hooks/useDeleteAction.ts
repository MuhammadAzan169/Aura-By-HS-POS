import { useConfirm } from './useConfirm';
import { useToast } from './useToast';

/**
 * Delete with a confirmation step, everywhere the same way: ask, do it, say
 * what happened — or explain why it was refused.
 */
export function useDeleteAction(): (opts: {
  title: string;
  description?: string;
  run: () => Promise<unknown>;
  done: string;
  onDone?: () => void;
}) => Promise<void> {
  const confirm = useConfirm();
  const toast = useToast();
  return async ({ title, description, run, done, onDone }) => {
    const result = await confirm({
      title,
      description: description ?? 'This cannot be undone.',
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!result.confirmed) return;
    try {
      await run();
      toast.success(done);
      onDone?.();
    } catch (error) {
      toast.fromError(error);
    }
  };
}
