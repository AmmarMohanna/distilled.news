import { Atom, BookOpen, Building2, Cpu, Globe2, Landmark, Music, Newspaper, Palette, Plane, Scale, Sprout, Trees, Trophy, Utensils } from "lucide-react";

const subjects = [
  { pattern: /politic|politique|election|élection|parliament|government|diplomac|سياس|انتخاب/i, icon: Landmark },
  { pattern: /football|soccer|sport|premier league|champions league|fifa|basketball|tennis|كرة القدم|رياضة/i, icon: Trophy },
  { pattern: /plant|garden|jardin|botan|flower|agricultur|نبات|زراع/i, icon: Sprout },
  { pattern: /econom|économ|financ|market|business|bank|اقتصاد|أسواق/i, icon: Building2 },
  { pattern: /\bai\b|tech|software|comput|robot|artificial intelligence/i, icon: Cpu },
  { pattern: /climate|environment|forest|nature|lebanon|beirut/i, icon: Trees },
  { pattern: /science|physics|research|space/i, icon: Atom },
  { pattern: /music|concert|song/i, icon: Music },
  { pattern: /educat|book|literature|school/i, icon: BookOpen },
  { pattern: /travel|touris|aviation/i, icon: Plane },
  { pattern: /food|cook|restaurant/i, icon: Utensils },
  { pattern: /\blaw\b|justice|court|legal/i, icon: Scale },
  { pattern: /culture|media|art|film|cinema/i, icon: Palette },
  { pattern: /world|global|international/i, icon: Globe2 }
];

export function FeedArt({ kind, feed, canGenerate = false }: { kind?: string; canGenerate?: boolean; feed?: { id?: string; title: string; interestProfile?: string; ownerUsername?: string; slug?: string } }) {
  // Resolve title first so incidental words in a longer profile don't replace
  // the feed's main topic. Public cards need only the public title.
  const match = subjects.find(item => item.pattern.test(feed?.title ?? ""))
    ?? subjects.find(item => item.pattern.test(feed?.interestProfile ?? ""));
  const Icon = match?.icon ?? ({ coast: Trees, world: Globe2, tech: Cpu, city: Building2, science: Atom, culture: Palette })[kind ?? ""] ?? Newspaper;
  return <span className="topic-art pencil-art" aria-hidden="true"><span className="pencil-drawing"><Icon strokeWidth={0.95}/><Icon className="pencil-trace" strokeWidth={0.45}/></span></span>;
}
