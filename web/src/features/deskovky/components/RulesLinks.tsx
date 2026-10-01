import { BOARD_RULES_SCORING,BOARD_RULES_TOURNAMENT } from '../rules';

export function RulesLinks({ className = 'deskovky-rules-links' }: { className?: string }) {
  return (
    <div className={className}>
      {BOARD_RULES_TOURNAMENT ? (
        <a href={BOARD_RULES_TOURNAMENT} target="_blank" rel="noreferrer" className="admin-button admin-button--primary">
          Pravidla turnaje
        </a>
      ) : (
        <span className="admin-error">Soubor „Pravidla turnaje“ nebyl nalezen.</span>
      )}

      {BOARD_RULES_SCORING ? (
        <a href={BOARD_RULES_SCORING} target="_blank" rel="noreferrer" className="admin-button admin-button--secondary">
          Hodnocení turnaje
        </a>
      ) : (
        <span className="admin-error">Soubor „Hodnocení turnaje“ nebyl nalezen.</span>
      )}
    </div>
  );
}
