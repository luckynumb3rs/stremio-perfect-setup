import { WizardShell } from '../components/WizardShell';
import { NextButton } from '../components/NextButton';
import { useWizard } from '../store/wizard';
export function ServicesStep() {
  const { nextStep } = useWizard();
  return <WizardShell><p className="text-gray-500">Services step — coming soon</p><NextButton onClick={nextStep} /></WizardShell>;
}
