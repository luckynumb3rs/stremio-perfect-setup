import { useEffect } from 'react';
import { useWizard } from './store/wizard';
import { Welcome } from './steps/Welcome';
import { AccountStep } from './steps/AccountStep';
import { KeysStep } from './steps/KeysStep';
import { ServicesStep } from './steps/ServicesStep';
import { DynamicFieldStep } from './steps/DynamicFieldStep';
import { CatalogStep } from './steps/CatalogStep';
import { InstallingStep } from './steps/InstallingStep';
import { DoneStep } from './steps/DoneStep';
import { TEMPLATE_URLS } from './lib/constants';

// Step index mapping:
// 0:Welcome, 1:Account, 2-6:Keys(5 screens), 7:Services,
// 8-13:DynamicFields(6 slots), 14:Catalogs, 15:Installing, 16+:Done
function StepRouter() {
  const { step, templates, setTemplates } = useWizard();

  useEffect(() => {
    if (templates) return;
    Promise.all([
      fetch(TEMPLATE_URLS.aiostreams).then(r => r.json()),
      fetch(TEMPLATE_URLS.aiometadataStremio).then(r => r.json()),
      fetch(TEMPLATE_URLS.collections).then(r => r.json()),
    ]).then(([aiostreams, aiometadata, collections]) => {
      setTemplates({ aiostreams, aiometadata, collections });
    }).catch(console.error);
  }, []);

  if (step === 0) return <Welcome />;
  if (step === 1) return <AccountStep />;
  if (step >= 2 && step <= 6) return <KeysStep keyIndex={step - 2} />;
  if (step === 7) return <ServicesStep />;
  if (step >= 8 && step <= 13) return <DynamicFieldStep fieldIndex={step - 8} />;
  if (step === 14) return <CatalogStep />;
  if (step === 15) return <InstallingStep />;
  return <DoneStep />;
}

export default function App() {
  return <StepRouter />;
}
