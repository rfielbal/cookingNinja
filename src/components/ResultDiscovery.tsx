import { ArrowUpRight, Code2 } from 'lucide-react';
import './result-discovery.css';

export function ResultDiscovery() {
  return (
    <a
      className="result-discovery"
      href="/atelier#atelier-decouverte"
      target="_blank"
      rel="noopener noreferrer"
    >
      <Code2 size={19} aria-hidden="true" />
      <span>
        <strong>Entrez dans les coulisses du jeu</strong>
        <small>6 étapes animées · nouvel onglet</small>
      </span>
      <ArrowUpRight size={17} aria-hidden="true" />
    </a>
  );
}
