import { WizardShell } from '../components/WizardShell';
import { useWizard } from '../store/wizard';
export function InstallingStep() {
  const { nextStep } = useWizard();
  return <WizardShell showBack={false}><p className="text-gray-500">Installing — coming soon</p><button onClick={nextStep} className="mt-4 text-accent">Skip</button></WizardShell>;
}
