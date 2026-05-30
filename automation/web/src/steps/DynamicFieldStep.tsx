import { WizardShell } from '../components/WizardShell';
import { NextButton } from '../components/NextButton';
import { useWizard } from '../store/wizard';
interface Props { fieldIndex: number; }
export function DynamicFieldStep({ fieldIndex: _ }: Props) {
  const { nextStep } = useWizard();
  return <WizardShell><p className="text-gray-500">Dynamic field — coming soon</p><NextButton onClick={nextStep} /></WizardShell>;
}
