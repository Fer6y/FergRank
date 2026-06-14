// ─────────────────────────────────────────────────────────────────────────
//  research/oddsNameOverrides.ts — odds-source name → CSV "Full Name".
//
//  The odds feed (betmma.tips lineage) writes fighter names differently from
//  Fighters_Stats.csv: abbreviations (Dan↔Daniel), transliterations
//  (Sergei↔Sergey), dropped middle names, East-Asian name-order flips
//  (Zhang Weili↔Weili Zhang), hyphen/spacing quirks, and married/fight-name
//  changes (Tecia Torres→Pennington). resolveNameToId can't bridge those.
//
//  This map lives in the RESEARCH zone on purpose — it is applied only by the
//  odds join, never by the engine's official-rankings resolution. The shared
//  src/lib/nameResolver.ts is left completely untouched, so the firewall holds
//  and rankings stay byte-identical.
//
//  RULES for adding entries (keep them safe):
//    • Only map when you are confident it's the SAME human. A shared last name
//      is NOT enough ("Alexander Torres" ≠ "Miguel Torres").
//    • Right-hand side must be the EXACT `Full Name` string in
//      Fighters_Stats.csv (the resolver exact-matches it).
//    • When in doubt, leave it out — a dropped row is safe; a wrong merge
//      corrupts two fighters' stats. auditOdds.ts lists the remaining misses.
// ─────────────────────────────────────────────────────────────────────────

export const ODDS_NAME_OVERRIDES: Record<string, string> = {
  // ── Abbreviations / first-name variants ──
  'Alex Volkanovski': 'Alexander Volkanovski',
  'Alex Munoz': 'Alexander Munoz',
  'Daniel Hooker': 'Dan Hooker',
  'Jim Crute': 'Jimmy Crute',
  'Joseph Duffy': 'Joe Duffy',
  'Josh Burkman': 'Joshua Burkman',
  'Joshua Culibao': 'Josh Culibao',
  'Mike Trizano': 'Michael Trizano',
  'Nathan Maness': 'Nate Maness',
  'Rick Glenn': 'Ricky Glenn',
  'Robbie Peralta': 'Robert Peralta',
  'Steven Kennedy': 'Steve Kennedy',
  'Vincent Morales': 'Vince Morales',
  'Zachary Reese': 'Zach Reese',
  'Matt Semelsberger': 'Matthew Semelsberger',
  'Charlie Radtke': 'Charles Radtke',
  'Valentine Woodburn': 'Val Woodburn',
  'Michael Parkin': 'Mick Parkin',
  'Patrick Holohan': 'Paddy Holohan',

  // ── Transliteration / spelling variants ──
  'Alexander Romanov': 'Alexandr Romanov',
  'Alexandra Albu': 'Aleksandra Albu',
  'Alexey Kunchenko': 'Aleksei Kunchenko',
  'Dmitriy Sosnovskiy': 'Dmitry Sosnovskiy',
  'Dmitry Smoliakov': 'Dmitrii Smoliakov',
  'Sergey Pavlovich': 'Sergei Pavlovich',
  'Sergey Spivak': 'Serghei Spivac',
  'Saparbek Safarov': 'Saparbeg Safarov',
  'Manny Gamburyan': 'Manvel Gamburyan',
  'Melsik Bagdasaryan': 'Melsik Baghdasaryan',
  'Muhammadjon Naimov': 'Muhammad Naimov',
  'Viktoriya Dudakova': 'Viktoriia Dudakova',
  'Yanal Ashmoz': 'Yanal Ashmouz',
  'Yuri Alcantara': 'Iuri Alcantara',
  'Christian Quinonez': 'Cristian Quinonez',
  'Bharat Khandare': 'Bharat Kandare',
  'Elves Brenner': 'Elves Brener',
  'Freddy Serrano': 'Fredy Serrano',
  'Frank Trevino': 'Francisco Trevino',
  'Nick Negumereanu': 'Nicolae Negumereanu',
  'Nico Musoke': 'Nicholas Musoke',
  'Costas Philippou': 'Constantinos Philippou',
  'Edmilson Souza': 'Edimilson Souza',

  // ── Dropped / added middle names & suffixes ──
  'Carlos Diego Ferreira': 'Diego Ferreira',
  'Jeka Asparido Saragih': 'Jeka Saragih',
  'Jesus Santos Aguilar': 'Jesus Aguilar',
  'Jorge Antonio Cezario de Oliveira': 'Jorge de Oliveira',
  'Klidson Farias de Abreu': 'Klidson Abreu',
  'Lara Fritzen Procopio': 'Lara Procopio',
  'Sheymon da Silva Moraes': 'Sheymon Moraes',
  'Wagner Silva Gomes': 'Wagner Silva',
  'Rodrigo Nascimento Ferreira': 'Rodrigo Nascimento',
  'Natalia Cristina da Silva': 'Natalia Silva',
  'Rodrigo Lima': 'Rodrigo de Lima',
  'Rodrigo Nogueira': 'Antonio Rodrigo Nogueira',
  'Christian Duncan': 'Christian Leroy Duncan',
  'Billy Goff': 'Billy Ray Goff',
  'Montserrat Ruiz': 'Montserrat Conejo Ruiz',
  'Montserrat Rendon': 'Montse Rendon',
  'Mark O. Madsen': 'Mark Madsen',
  'Khalil Rountree': 'Khalil Rountree Jr.',
  'Antonio Dos Santos Jr.': 'Antonio Dos Santos',
  'Geraldo De Freitas Jr.': 'Geraldo de Freitas',
  'Jailton Junior': 'Jailton Almeida',
  'Marcio Alexandre Jr.': 'Marcio Alexandre Junior',
  'Livia Renata Souza': 'Livinha Souza',

  // ── Hyphen / spacing quirks ──
  'Benoit Saint-Denis': 'Benoit Saint Denis',
  'Ovince St Preux': 'Ovince Saint Preux',
  'Waldo Cortes-Acosta': 'Waldo Cortes Acosta',
  'Da Un Jung': 'Da Woon Jung',
  'Doo Ho Choi': 'Dooho Choi',
  'Seung Woo Choi': 'SeungWoo Choi',
  'Jun Yong Park': 'JunYong Park',
  'Hyun Sung Park': 'HyunSung Park',
  'Ali Al Qaisi': 'Ali AlQaisi',
  'Mark Delarosa': 'Mark De La Rosa',

  // ── East-Asian / Central-Asian name-order flips & single names ──
  'Weili Zhang': 'Zhang Weili',
  'Yadong Song': 'Song Yadong',
  'Kenan Song': 'Song Kenan',
  'Na Liang': 'Liang Na',
  'Ning Guangyou': 'Guangyou Ning',
  'Yanan Wu': 'Wu Yanan',
  'Qileng Aori': 'Aoriqileng',
  'Zha Yi': 'Yizha',
  'Zhu Rong': 'Rongzhu',
  'Zhuikui Yao': 'Yao Zhikui',
  'Magomed Bibulatov': 'Bibulatov Magomed',
  'Danaa Batgerel': 'Batgerel Danaa',
  'Heili Alateng': 'Alatengheili',
  'Su Mudaerji': 'Sumudaerji',
  'Wuliji Buren': 'Wulijiburen',
  'Hayisaer Maheshate': 'Maheshate',
  'Abusupiyan Magomedov': 'Abus Magomedov',
  'Sharabutdin Magomedov': 'Shara Magomedov',

  // ── Nicknames-as-names, married names & known aliases (SAME fighter) ──
  'Bobby Green': 'King Green',
  'Gabriel Green': 'Gabe Green',
  'Enrique Briones': 'Henry Briones',
  'Jose Mariscal': 'Chepe Mariscal',
  'Lupita Godinez': 'Loopy Godinez',
  'Ronaldo Souza': 'Jacare Souza',
  'Rodrigo Vargas': 'Kazula Vargas',
  'Carlos Vergara': 'CJ Vergara',
  'Roberto Sanchez': 'Robert Sanchez',
  'Ian Garry': 'Ian Machado Garry',
  'Mike Mathetha': 'Blood Diamond',
  'Tecia Torres': 'Tecia Pennington',          // married name
  'Katlyn Chookagian': 'Katlyn Cerminara',      // married name
  'Veronica Macedo': 'Veronica Hardy',          // married name
  'Cheyanne Buys': 'Cheyanne Vlismas',          // married name
  'Michelle Waterson': 'Michelle Waterson-Gomez', // married name
  'Kalinn Williams': 'Khaos Williams',          // legal vs fight name
  'Phil Brooks': 'CM Punk',                     // Phil "CM Punk" Brooks
  'Urijah Hall': 'Uriah Hall',                  // spelling

  // ── Added/dropped middle & last names (verified single match) ──
  'Luiz Garagorri': 'Eduardo Garagorri',
  'Glaico Franca': 'Glaico Franca Moreira',
  'Luis Henrique da Silva': 'Luis Henrique',    // ≠ "Henrique da Silva" (distinct fighter)
  'Alvaro Herrera': 'Alvaro Herrera Mendoza',
  'Wendell Oliveira': 'Wendell Oliveira Marques',
};
