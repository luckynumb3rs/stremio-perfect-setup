// NOTE: This component is no longer used in routing (replaced by DebridStep). Kept for reference.
import { WizardShell } from '../components/WizardShell';
import { NextButton } from '../components/NextButton';
import { ServiceCard } from '../components/ServiceCard';
import { useWizard } from '../store/wizard';
import { SERVICES, DEBRID_SERVICES } from '../lib/services';

export function ServicesStep() {
  const { credentials, setCredentials, nextStep } = useWizard();
  const selectedId = credentials.debridService;

  function toggle(id: string) {
    setCredentials({ debridService: selectedId === id ? '' : id });
  }

  return (
    <WizardShell>
      <h2 className="text-xl font-bold mb-1">AIOStreams - Select Services</h2>
      <p className="text-gray-500 text-sm mb-4 leading-relaxed">
        Confirm your Debrid service (pre-filled from the previous step).
        AIOStreams will use this to fetch cached streams.
      </p>

      <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Debrid Services</p>
      <div className="grid grid-cols-4 gap-2 mb-5">
        {DEBRID_SERVICES.map(s => (
          <ServiceCard
            key={s.id}
            service={s}
            selected={s.id === selectedId}
            onToggle={() => toggle(s.id)}
          />
        ))}
      </div>

      <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Usenet <span className="font-normal text-gray-400">(advanced - manual config)</span></p>
      <div className="grid grid-cols-4 gap-2 mb-4">
        {SERVICES.filter(s => s.isUsenet).map(s => (
          <ServiceCard key={s.id} service={s} selected={false} onToggle={() => {}} />
        ))}
      </div>

      {!selectedId && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 mb-2 text-sm text-amber-700">
          ⚠️ No service selected - P2P / HTTP-only mode will be used (free, but slower).
        </div>
      )}

      <NextButton onClick={nextStep} />
    </WizardShell>
  );
}
