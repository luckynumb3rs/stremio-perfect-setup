import { WizardShell } from '../components/WizardShell';
import { NextButton } from '../components/NextButton';
import { useWizard } from '../store/wizard';
export function AccountStep() {
  const { nextStep } = useWizard();
  return <WizardShell><p className="text-gray-500">Account step — coming soon</p><NextButton onClick={nextStep} /></WizardShell>;
}
