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
        <strong>Comment votre geste devient une coupe ?</strong>
        <small>À découvrir en 30 secondes · nouvel onglet</small>
      </span>
      <ArrowUpRight size={17} aria-hidden="true" />
    </a>
  );
}
