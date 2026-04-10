import { Save, Trash2, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
} from '@/components/ui/alert-dialog'

export type UnsavedChangesAction = 'save' | 'discard' | 'cancel'

interface UnsavedChangesDialogProps {
  open: boolean
  onAction: (action: UnsavedChangesAction) => void
  isSaving?: boolean
  disableDiscard?: boolean
}

export function UnsavedChangesDialog({
  open,
  onAction,
  isSaving = false,
  disableDiscard = false,
}: UnsavedChangesDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onAction('cancel')}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Modifications non enregistrées</AlertDialogTitle>
          <AlertDialogDescription>
            Vous avez des modifications en cours. Que souhaitez-vous faire ?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:gap-2 mt-4">
          <Button
            variant="outline"
            onClick={() => onAction('cancel')}
            disabled={isSaving}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Annuler
          </Button>
          <Button
            variant="destructive"
            onClick={() => onAction('discard')}
            disabled={isSaving || disableDiscard}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Abandonner
          </Button>
          <Button
            onClick={() => onAction('save')}
            disabled={isSaving}
          >
            <Save className="h-4 w-4 mr-2" />
            {isSaving ? 'Enregistrement...' : 'Enregistrer'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
