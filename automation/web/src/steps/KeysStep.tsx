import { WizardShell } from '../components/WizardShell';
import { NextButton } from '../components/NextButton';
import { useWizard } from '../store/wizard';
interface Props { keyIndex: number; }
export function KeysStep({ keyIndex: _ }: Props) {
  const { nextStep } = useWizard();
  return <WizardShell><p className="text-gray-500">Keys step — coming soon</p><NextButton onClick={nextStep} /></WizardShell>;
}
