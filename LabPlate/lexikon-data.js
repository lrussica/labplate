// LabPlate – Lexikon-Inhalte, jetzt vollstaendig mehrsprachig (de/en/es/it, dieselben vier
// Sprachen wie der Rest der App). Jedes Textfeld (title/summary/mainContent/deepDive) ist ein
// Objekt {de,en,es,it} - Rendering greift ueber pick() (siehe LabPlate_34_Cursor.html) darauf
// zu, exakt dasselbe Muster wie alle anderen LBL_*-Uebersetzungstabellen der App.
// Bewusst als eigene Datei ausgelagert, um LabPlate_34_Cursor.html schlank zu halten.
// Wird von LabPlate_34_Cursor.html per <script src="lexikon-data.js"> im <head> geladen und
// muss deshalb VOR dem Hauptscript im Dokument stehen.
window.lexikonData = [
  {
    id: 1,
    icon: "🍬",
    title: {
      de: "Zucker – Glukose & Fruktose",
      en: "Sugar – Glucose & Fructose",
      es: "Azúcar – Glucosa y Fructosa",
      it: "Zucchero – Glucosio e Fruttosio"
    ,
      pt: "Açúcar – Glicose e Frutose",
      fr: "Sucre – Glucose et Fructose",
      tr: "Şeker – Glikoz ve Fruktoz"
    },
    summary: {
      de: "Glukose ist der Treibstoff für deinen Körper – Fruktose wird in der Leber verarbeitet und kann bei zu viel direkt zu Fett werden.",
      en: "Glucose is fuel for your body – fructose is processed in the liver and, in excess, can turn directly into fat.",
      es: "La glucosa es el combustible de tu cuerpo – la fructosa se procesa en el hígado y, en exceso, puede convertirse directamente en grasa.",
      it: "Il glucosio è il carburante del tuo corpo – il fruttosio viene elaborato nel fegato e, in eccesso, può trasformarsi direttamente in grasso."
    ,
      pt: "A glicose é o combustível para o teu corpo – a frutose é processada no fígado e, em excesso, pode transformar-se diretamente em gordura.",
      fr: "Le glucose est le carburant de ton corps – le fructose est traité par le foie et, en excès, peut se transformer directement en graisse.",
      tr: "Glikoz vücudunun yakıtıdır – fruktoz karaciğerde işlenir ve aşırı miktarda doğrudan yağa dönüşebilir."
    },
    mainContent: {
      de: "Zucker ist nicht gleich Zucker. Dein Körper behandelt Traubenzucker (Glukose) und Fruchtzucker (Fruktose) völlig unterschiedlich. Wer das versteht, hat den ersten Schritt zur besseren Stoffwechselkontrolle geschafft. Glukose kommt vor in Brot, Nudeln, Reis, Kartoffeln und Süßigkeiten. Dein Körper braucht Glukose als Hauptenergielieferant für Gehirn und Muskeln. Sie erhöht den Blutzucker schnell – das ist gewollt, aber die Menge macht den Unterschied. Fruktose kommt vor in Obst, Honig, Maissirup und Fertigprodukten. Sie wird nicht direkt im Blut transportiert, sondern in der Leber verarbeitet. Bei hohem Konsum wird Fruktose in der Leber direkt in Fett umgewandelt – ein Haupttreiber für erhöhte Triglyceride.",
      en: "Not all sugar is the same. Your body treats glucose and fructose completely differently. Understanding this is the first step toward better metabolic control. Glucose is found in bread, pasta, rice, potatoes, and sweets. Your body needs glucose as the main energy source for the brain and muscles. It raises blood sugar quickly – that's intentional, but the amount makes the difference. Fructose is found in fruit, honey, corn syrup, and processed foods. It isn't transported directly in the blood but is processed in the liver. With high intake, the liver converts fructose directly into fat – a major driver of elevated triglycerides.",
      es: "No todo el azúcar es igual. Tu cuerpo trata la glucosa y la fructosa de forma completamente distinta. Entender esto es el primer paso hacia un mejor control metabólico. La glucosa se encuentra en el pan, la pasta, el arroz, las patatas y los dulces. Tu cuerpo necesita glucosa como principal fuente de energía para el cerebro y los músculos. Eleva el azúcar en sangre rápidamente – eso es intencionado, pero la cantidad marca la diferencia. La fructosa se encuentra en la fruta, la miel, el jarabe de maíz y los productos procesados. No se transporta directamente en la sangre, sino que se procesa en el hígado. Con un consumo elevado, el hígado convierte la fructosa directamente en grasa – uno de los principales impulsores del aumento de los triglicéridos.",
      it: "Non tutti gli zuccheri sono uguali. Il tuo corpo tratta il glucosio e il fruttosio in modo completamente diverso. Capirlo è il primo passo verso un migliore controllo del metabolismo. Il glucosio si trova in pane, pasta, riso, patate e dolci. Il tuo corpo ha bisogno di glucosio come principale fonte di energia per cervello e muscoli. Fa salire rapidamente la glicemia – è voluto, ma la quantità fa la differenza. Il fruttosio si trova in frutta, miele, sciroppo di mais e prodotti confezionati. Non viene trasportato direttamente nel sangue, ma elaborato nel fegato. Con un consumo elevato, il fegato trasforma il fruttosio direttamente in grasso – uno dei principali fattori dell'aumento dei trigliceridi."
    ,
      pt: "Nem todo açúcar é igual. O teu corpo trata a glicose e a frutose de forma completamente diferente. Quem entende isso deu o primeiro passo para um melhor controlo metabólico. A glicose encontra-se em pão, massa, arroz, batatas e doces. O teu corpo precisa de glicose como principal fonte de energia para o cérebro e os músculos. Ela eleva rapidamente o açúcar no sangue – isso é intencional, mas a quantidade faz a diferença. A frutose encontra-se em fruta, mel, xarope de milho e produtos processados. Não é transportada diretamente no sangue, mas processada no fígado. Com um consumo elevado, o fígado converte a frutose diretamente em gordura – um dos principais fatores para o aumento dos triglicéridos.",
      fr: "Tous les sucres ne se valent pas. Ton corps traite le glucose et le fructose de manière totalement différente. Comprendre cela est le premier pas vers un meilleur contrôle métabolique. Le glucose se trouve dans le pain, les pâtes, le riz, les pommes de terre et les sucreries. Ton corps a besoin de glucose comme principale source d'énergie pour le cerveau et les muscles. Il fait rapidement monter la glycémie – c'est voulu, mais la quantité fait la différence. Le fructose se trouve dans les fruits, le miel, le sirop de maïs et les produits transformés. Il n'est pas transporté directement dans le sang, mais traité par le foie. En cas de consommation élevée, le foie transforme directement le fructose en graisse – un facteur majeur de l'augmentation des triglycérides.",
      tr: "Her şeker aynı değildir. Vücudun glikoz ve fruktozu tamamen farklı şekilde işler. Bunu anlamak, daha iyi bir metabolik kontrolün ilk adımıdır. Glikoz; ekmek, makarna, pirinç, patates ve tatlılarda bulunur. Vücudun, beyin ve kaslar için ana enerji kaynağı olarak glikoza ihtiyaç duyar. Kan şekerini hızla yükseltir – bu istenen bir durumdur, ama miktar fark yaratır. Fruktoz; meyve, bal, mısır şurubu ve işlenmiş gıdalarda bulunur. Doğrudan kanda taşınmaz, karaciğerde işlenir. Yüksek tüketimde karaciğer fruktozu doğrudan yağa dönüştürür – bu, yükselen trigliseritlerin başlıca nedenlerinden biridir."
    },
    deepDive: {
      de: "Biochemisch gesehen wird Fruktose in der Leber über den Enzymweg der Fructokinase zu Fructose-1-phosphat umgewandelt. Anders als bei Glukose gibt es bei der Fruktose keine negative Rückkopplung – das bedeutet, die Leber kann Fruktose ungebremst verarbeiten, was bei hohen Mengen zur Fettneubildung (De-novo-Lipogenese) führt.",
      en: "Biochemically, the liver converts fructose into fructose-1-phosphate via the enzyme fructokinase. Unlike glucose, there is no negative feedback loop for fructose – meaning the liver can process fructose without restraint, which at high amounts leads to fat formation (de novo lipogenesis).",
      es: "Desde el punto de vista bioquímico, el hígado convierte la fructosa en fructosa-1-fosfato mediante la enzima fructoquinasa. A diferencia de la glucosa, no existe retroalimentación negativa para la fructosa, lo que significa que el hígado puede procesarla sin freno, lo que en grandes cantidades conduce a la formación de grasa (lipogénesis de novo).",
      it: "Dal punto di vista biochimico, il fegato converte il fruttosio in fruttosio-1-fosfato tramite l'enzima fruttochinasi. A differenza del glucosio, per il fruttosio non esiste un feedback negativo - questo significa che il fegato può elaborarlo senza freni, il che in grandi quantità porta alla formazione di grasso (lipogenesi de novo)."
    ,
      pt: "Do ponto de vista bioquímico, o fígado converte a frutose em frutose-1-fosfato através da enzima frutocinase. Ao contrário da glicose, não existe retroalimentação negativa para a frutose – isto significa que o fígado pode processá-la sem qualquer travão, o que em grandes quantidades leva à formação de gordura (lipogénese de novo).",
      fr: "D'un point de vue biochimique, le foie convertit le fructose en fructose-1-phosphate via l'enzyme fructokinase. Contrairement au glucose, il n'existe pas de rétrocontrôle négatif pour le fructose – ce qui signifie que le foie peut le traiter sans frein, ce qui, en grande quantité, entraîne la formation de graisse (lipogenèse de novo).",
      tr: "Biyokimyasal açıdan karaciğer, fruktozu fruktokinaz enzimi aracılığıyla fruktoz-1-fosfata dönüştürür. Glikozdan farklı olarak fruktoz için negatif geri bildirim mekanizması yoktur – bu da karaciğerin fruktozu sınırsızca işleyebileceği anlamına gelir; bu durum yüksek miktarlarda yağ oluşumuna (de novo lipogenez) yol açar."
    },
    personalized: true,
    relevantLabKey: "triglycerides"
  },
  {
    id: 2,
    icon: "🧂",
    title: {
      de: "Haushaltszucker (Saccharose)",
      en: "Table Sugar (Sucrose)",
      es: "Azúcar de mesa (Sacarosa)",
      it: "Zucchero da tavola (Saccarosio)"
    ,
      pt: "Açúcar de mesa (Sacarose)",
      fr: "Sucre de table (Saccharose)",
      tr: "Sofra Şekeri (Sükroz)"
    },
    summary: {
      de: "Haushaltszucker besteht zur Hälfte aus Glukose und zur Hälfte aus Fruktose – du bekommst also beide Effekte gleichzeitig.",
      en: "Table sugar is half glucose and half fructose – so you get both effects at once.",
      es: "El azúcar de mesa es mitad glucosa y mitad fructosa – así que obtienes ambos efectos a la vez.",
      it: "Lo zucchero da tavola è per metà glucosio e per metà fruttosio – quindi ottieni entrambi gli effetti contemporaneamente."
    ,
      pt: "O açúcar de mesa é metade glicose e metade frutose – por isso recebes os dois efeitos ao mesmo tempo.",
      fr: "Le sucre de table est moitié glucose, moitié fructose – tu reçois donc les deux effets en même temps.",
      tr: "Sofra şekeri yarı yarıya glikoz ve fruktozdan oluşur – yani her iki etkiyi aynı anda yaşarsın."
    },
    mainContent: {
      de: "Haushaltszucker ist der Klassiker. Er steckt im Kaffee, in Kuchen, in Limonade – und oft in Lebensmitteln, wo man ihn gar nicht vermutet. Chemisch gesehen besteht Haushaltszucker zu 50 Prozent aus Glukose und zu 50 Prozent aus Fruktose. Er wird im Darm sofort in beide Bestandteile gespalten. Das bedeutet: Du bekommst beide Effekte gleichzeitig – den schnellen Glukose-Peak und die Fruktose, die in der Leber verarbeitet wird. Die Weltgesundheitsorganisation empfiehlt maximal 25 bis 30 Gramm freien Zucker pro Tag (das sind etwa 6 Teelöffel). Zum Vergleich: Eine einzelne 0,5-Liter-Flasche Cola enthält bereits 50 bis 60 Gramm.",
      en: "Table sugar is the classic. It's in coffee, cake, soda – and often in foods where you wouldn't expect it. Chemically, table sugar is 50 percent glucose and 50 percent fructose. It's split into both components immediately in the gut. That means you get both effects at once – the fast glucose spike and the fructose that's processed in the liver. The World Health Organization recommends a maximum of 25 to 30 grams of free sugar per day (about 6 teaspoons). For comparison: a single 0.5-liter bottle of cola already contains 50 to 60 grams.",
      es: "El azúcar de mesa es el clásico. Está en el café, en la tarta, en los refrescos – y a menudo en alimentos donde ni te lo imaginas. Químicamente, el azúcar de mesa es 50 % glucosa y 50 % fructosa. Se descompone en ambos componentes inmediatamente en el intestino. Eso significa que obtienes ambos efectos a la vez – el pico rápido de glucosa y la fructosa que se procesa en el hígado. La Organización Mundial de la Salud recomienda un máximo de 25 a 30 gramos de azúcar libre al día (unas 6 cucharaditas). Para comparar: una sola botella de 0,5 litros de cola ya contiene entre 50 y 60 gramos.",
      it: "Lo zucchero da tavola è il classico. Si trova nel caffè, nella torta, nelle bibite – e spesso in alimenti dove non te lo aspetteresti. Dal punto di vista chimico, lo zucchero da tavola è per il 50% glucosio e per il 50% fruttosio. Viene scomposto in entrambi i componenti immediatamente nell'intestino. Questo significa che ottieni entrambi gli effetti contemporaneamente – il rapido picco di glucosio e il fruttosio che viene elaborato nel fegato. L'Organizzazione Mondiale della Sanità raccomanda un massimo di 25-30 grammi di zucchero libero al giorno (circa 6 cucchiaini). Per fare un confronto: una singola bottiglia da 0,5 litri di cola contiene già 50-60 grammi."
    ,
      pt: "O açúcar de mesa é o clássico. Está no café, no bolo, nos refrigerantes – e muitas vezes em alimentos onde nem imaginarias. Quimicamente, o açúcar de mesa é 50% glicose e 50% frutose. É decomposto nos dois componentes imediatamente no intestino. Isto significa que recebes os dois efeitos ao mesmo tempo – o pico rápido de glicose e a frutose que é processada no fígado. A Organização Mundial da Saúde recomenda um máximo de 25 a 30 gramas de açúcar livre por dia (cerca de 6 colheres de chá). Para comparação: uma única garrafa de 0,5 litros de cola já contém entre 50 e 60 gramas.",
      fr: "Le sucre de table est le grand classique. On le trouve dans le café, les gâteaux, les sodas – et souvent dans des aliments où on ne l'attend pas. Chimiquement, le sucre de table est composé à 50 % de glucose et à 50 % de fructose. Il est scindé en ces deux composants immédiatement dans l'intestin. Cela signifie que tu reçois les deux effets en même temps – le pic rapide de glucose et le fructose qui est traité par le foie. L'Organisation mondiale de la santé recommande un maximum de 25 à 30 grammes de sucres libres par jour (environ 6 cuillères à café). À titre de comparaison : une seule bouteille de cola de 0,5 litre en contient déjà 50 à 60 grammes.",
      tr: "Sofra şekeri klasik olandır. Kahvede, kekte, gazlı içeceklerde bulunur – ve genellikle hiç beklemediğin gıdalarda da. Kimyasal olarak sofra şekeri %50 glikoz ve %50 fruktozdan oluşur. Bağırsakta hemen bu iki bileşene ayrılır. Bu, her iki etkiyi aynı anda yaşadığın anlamına gelir – hızlı glikoz yükselişi ve karaciğerde işlenen fruktoz. Dünya Sağlık Örgütü günde en fazla 25-30 gram serbest şeker önermektedir (yaklaşık 6 çay kaşığı). Karşılaştırma için: tek bir 0,5 litrelik kola şişesi zaten 50-60 gram içerir."
    },
    deepDive: {
      de: "Die Aufspaltung von Saccharose in Glukose und Fruktose erfolgt im Dünndarm durch das Enzym Saccharase. Die Geschwindigkeit dieser Spaltung ist so hoch, dass beide Zuckerarten nahezu gleichzeitig im Blut ankommen.",
      en: "Sucrose is split into glucose and fructose in the small intestine by the enzyme sucrase. This splitting happens so quickly that both types of sugar arrive in the blood almost simultaneously.",
      es: "La sacarosa se descompone en glucosa y fructosa en el intestino delgado gracias a la enzima sacarasa. Esta descomposición es tan rápida que ambos tipos de azúcar llegan a la sangre casi al mismo tiempo.",
      it: "Il saccarosio viene scomposto in glucosio e fruttosio nell'intestino tenue dall'enzima saccarasi. Questa scomposizione avviene così rapidamente che entrambi i tipi di zucchero arrivano nel sangue quasi contemporaneamente."
    ,
      pt: "A decomposição da sacarose em glicose e frutose ocorre no intestino delgado através da enzima sacarase. Esta decomposição é tão rápida que ambos os tipos de açúcar chegam ao sangue quase simultaneamente.",
      fr: "La décomposition du saccharose en glucose et fructose a lieu dans l'intestin grêle grâce à l'enzyme saccharase. Cette décomposition est si rapide que les deux types de sucre arrivent dans le sang presque simultanément.",
      tr: "Sükrozun glikoz ve fruktoza ayrışması ince bağırsakta sükraz enzimi aracılığıyla gerçekleşir. Bu ayrışma o kadar hızlıdır ki her iki şeker türü de kana neredeyse aynı anda ulaşır."
    },
    personalized: true,
    relevantLabKey: "triglycerides"
  },
  {
    id: 3,
    icon: "❤️",
    title: {
      de: "Auswirkung auf deine Werte",
      en: "Effect on Your Values",
      es: "Efecto en tus valores",
      it: "Effetto sui tuoi valori"
    ,
      pt: "Efeito nos teus valores",
      fr: "Effet sur tes valeurs",
      tr: "Değerlerin Üzerindeki Etki"
    },
    summary: {
      de: "Deine Laborwerte – Triglyceride, LDL, HDL, Blutzucker, Blutdruck – sind ein System. Werden sie gemeinsam betrachtet, erzählen sie die Geschichte deines Stoffwechsels.",
      en: "Your lab values – triglycerides, LDL, HDL, blood sugar, blood pressure – are a system. Looked at together, they tell the story of your metabolism.",
      es: "Tus valores de laboratorio – triglicéridos, LDL, HDL, glucosa, presión arterial – forman un sistema. Vistos en conjunto, cuentan la historia de tu metabolismo.",
      it: "I tuoi valori di laboratorio – trigliceridi, LDL, HDL, glicemia, pressione – sono un sistema. Osservati insieme, raccontano la storia del tuo metabolismo."
    ,
      pt: "Os teus valores laboratoriais – triglicéridos, LDL, HDL, glicemia, pressão arterial – formam um sistema. Vistos em conjunto, contam a história do teu metabolismo.",
      fr: "Tes valeurs de laboratoire – triglycérides, LDL, HDL, glycémie, tension artérielle – forment un système. Considérées ensemble, elles racontent l'histoire de ton métabolisme.",
      tr: "Laboratuvar değerlerin – trigliserit, LDL, HDL, kan şekeri, kan basıncı – bir sistem oluşturur. Birlikte değerlendirildiklerinde metabolizmanın hikâyesini anlatırlar."
    },
    mainContent: {
      de: "Deine Laborwerte sind keine abstrakten Zahlen – sie sind die Botenstoffe deines Körpers. Triglyceride sind die wichtigste Transportform für Fett im Blut. Sie werden besonders durch Fruktose, Alkohol, einfache Kohlenhydrate und Übergewicht erhöht. LDL transportiert Cholesterin zu den Geweben. HDL transportiert überschüssiges Cholesterin zurück zur Leber. Der Blutzucker zeigt den kurzfristigen Zustand an, der HbA1c ist der Langzeitwert. Zucker und Blutfette können den Blutdruck mitbeeinflussen – starrere Gefäße gehen oft mit höherem Druck einher.",
      en: "Your lab values aren't abstract numbers – they're your body's messengers. Triglycerides are the main transport form for fat in the blood. They're especially raised by fructose, alcohol, simple carbohydrates, and being overweight. LDL transports cholesterol to the tissues. HDL transports excess cholesterol back to the liver. Blood sugar shows the short-term state, HbA1c is the long-term value. Sugar and blood fats can influence blood pressure – stiffer vessels often go with higher pressure.",
      es: "Tus valores de laboratorio no son cifras abstractas – son los mensajeros de tu cuerpo. Los triglicéridos son la principal forma de transporte de grasa en la sangre. Aumentan especialmente por la fructosa, el alcohol, los carbohidratos simples y el sobrepeso. El LDL transporta colesterol a los tejidos. El HDL transporta el colesterol sobrante de vuelta al hígado. La glucosa muestra el estado a corto plazo, la HbA1c es el valor a largo plazo. El azúcar y las grasas en sangre pueden influir en la presión arterial – vasos más rígidos suelen ir con mayor presión.",
      it: "I tuoi valori di laboratorio non sono numeri astratti – sono i messaggeri del tuo corpo. I trigliceridi sono la principale forma di trasporto dei grassi nel sangue. Aumentano soprattutto a causa di fruttosio, alcol, carboidrati semplici e sovrappeso. L'LDL trasporta il colesterolo ai tessuti. L'HDL riporta il colesterolo in eccesso al fegato. La glicemia mostra lo stato a breve termine, l'HbA1c è il valore a lungo termine. Zuccheri e grassi nel sangue possono influenzare la pressione – vasi più rigidi spesso vanno di pari passo con una pressione più alta."
    ,
      pt: "Os teus valores laboratoriais não são números abstratos – são os mensageiros do teu corpo. Os triglicéridos são a principal forma de transporte de gordura no sangue. Aumentam especialmente com a frutose, o álcool, os hidratos de carbono simples e o excesso de peso. O LDL transporta colesterol para os tecidos. O HDL transporta o colesterol em excesso de volta para o fígado. A glicemia mostra o estado a curto prazo, a HbA1c é o valor a longo prazo. O açúcar e as gorduras no sangue podem influenciar a pressão arterial – vasos mais rígidos costumam acompanhar pressão mais alta.",
      fr: "Tes valeurs de laboratoire ne sont pas des chiffres abstraits – ce sont les messagers de ton corps. Les triglycérides sont la principale forme de transport des graisses dans le sang. Ils sont particulièrement augmentés par le fructose, l'alcool, les glucides simples et le surpoids. Le LDL transporte le cholestérol vers les tissus. Le HDL ramène l'excès de cholestérol vers le foie. La glycémie indique l'état à court terme, l'HbA1c est la valeur à long terme. Sucre et graisses sanguines peuvent influencer la tension – des vaisseaux plus rigides vont souvent de pair avec une pression plus élevée.",
      tr: "Laboratuvar değerlerin soyut sayılar değildir – vücudunun habercileridir. Trigliseritler kandaki yağın en önemli taşıma şeklidir. Özellikle fruktoz, alkol, basit karbonhidratlar ve fazla kilo tarafından yükseltilirler. LDL kolesterolü dokulara taşır. HDL fazla kolesterolü karaciğere geri taşır. Kan şekeri kısa vadeli durumu gösterir, HbA1c ise uzun vadeli değerdir. Şeker ve kan yağları kan basıncını etkileyebilir – daha sert damarlar çoğu zaman daha yüksek basınçla birlikte gider."
    },
    deepDive: {
      de: "Der Quotient aus Triglyceriden und HDL wird oft als Orientierung für die Insulinempfindlichkeit genannt. Ob ein bestimmter Schwellenwert für dich passt, gehört individuell mit einer Fachperson besprochen – genauso wie der LDL/HDL-Quotient.",
      en: "The ratio of triglycerides to HDL is often used as an orientation for insulin sensitivity. Whether a particular threshold fits you should be discussed individually with a professional – the same goes for the LDL/HDL ratio.",
      es: "El cociente entre triglicéridos y HDL se usa a menudo como orientación sobre la sensibilidad a la insulina. Si un umbral concreto te conviene debe hablarse individualmente con un profesional – igual que el cociente LDL/HDL.",
      it: "Il rapporto tra trigliceridi e HDL viene spesso usato come orientamento sulla sensibilità all'insulina. Se una soglia specifica sia adatta a te va discusso individualmente con un professionista – lo stesso vale per il rapporto LDL/HDL."
    ,
      pt: "O quociente entre triglicéridos e HDL é muitas vezes usado como orientação para a sensibilidade à insulina. Se um limiar concreto te serve deve ser falado individualmente com um profissional – o mesmo vale para o quociente LDL/HDL.",
      fr: "Le rapport triglycérides/HDL est souvent utilisé comme repère pour la sensibilité à l'insuline. Savoir si un seuil précis te convient doit être discuté individuellement avec un professionnel – idem pour le rapport LDL/HDL.",
      tr: "Trigliserit/HDL oranı, insülin duyarlılığı için sıkça bir yönelim olarak anılır. Belirli bir eşiğin sana uyup uymadığı bireysel olarak bir uzmanla konuşulmalıdır – LDL/HDL oranı için de aynı şey geçerlidir."
    },
    personalized: true,
    relevantLabKey: "lipids"
  },
  {
    id: 4,
    icon: "🥦",
    title: { de: "Ballaststoffe", en: "Fiber", es: "Fibra", it: "Fibre", pt: "Fibra", fr: "Fibres", tr: "Lif" },
    summary: {
      de: "Ballaststoffe verlangsamen die Zuckeraufnahme, binden Fette, sättigen langanhaltend und füttern deine Darmflora – der heimliche Star jeder gesunden Ernährung.",
      en: "Fiber slows sugar absorption, binds fat, keeps you full for longer, and feeds your gut flora – the quiet star of any healthy diet.",
      es: "La fibra ralentiza la absorción de azúcar, une grasas, sacia durante más tiempo y alimenta tu flora intestinal – la estrella discreta de toda dieta sana.",
      it: "Le fibre rallentano l'assorbimento dello zucchero, legano i grassi, saziano a lungo e nutrono la tua flora intestinale – la stella silenziosa di ogni alimentazione sana."
    ,
      pt: "A fibra retarda a absorção de açúcar, liga gorduras, sacia por mais tempo e alimenta a tua flora intestinal – a estrela discreta de qualquer alimentação saudável.",
      fr: "Les fibres ralentissent l'absorption du sucre, fixent les graisses, rassasient durablement et nourrissent ta flore intestinale – la star discrète de toute alimentation saine.",
      tr: "Lif, şeker emilimini yavaşlatır, yağları bağlar, uzun süre tok tutar ve bağırsak florasını besler – sağlıklı beslenmenin sessiz yıldızıdır."
    },
    mainContent: {
      de: "Ballaststoffe sind der heimliche Star jeder gesunden Ernährung. Sie sind keine Nährstoffe im klassischen Sinne (dein Körper verdaut sie nicht), aber sie sind das Arbeitspferd deines Darms. Sie verlangsamen die Zuckeraufnahme, bilden ein Gel im Darm, das die Glukose langsamer freigibt. Sie binden Fette – einige Ballaststoffe können Cholesterin binden und ausscheiden. Sie sättigen langanhaltend, quellen im Magen auf und reduzieren so die Kalorienaufnahme. Sie füttern deine Darmflora – lösliche Ballaststoffe sind die Lieblingsnahrung deiner guten Darmbakterien. Die Tagesempfehlung liegt bei mindestens 30 Gramm.",
      en: "Fiber is the quiet star of any healthy diet. It's not a nutrient in the classic sense (your body doesn't digest it), but it's the workhorse of your gut. It slows sugar absorption, forming a gel in the gut that releases glucose more slowly. It binds fat – some fibers can bind cholesterol and help excrete it. It keeps you full for longer, swelling in the stomach and thereby reducing calorie intake. It feeds your gut flora – soluble fiber is the favorite food of your good gut bacteria. The daily recommendation is at least 30 grams.",
      es: "La fibra es la estrella discreta de toda dieta sana. No es un nutriente en el sentido clásico (tu cuerpo no la digiere), pero es el motor de tu intestino. Ralentiza la absorción de azúcar, formando un gel en el intestino que libera la glucosa más lentamente. Une grasas – algunas fibras pueden unir el colesterol y ayudar a excretarlo. Sacia durante más tiempo, se hincha en el estómago y así reduce la ingesta calórica. Alimenta tu flora intestinal – la fibra soluble es el alimento favorito de tus bacterias intestinales buenas. La recomendación diaria es de al menos 30 gramos.",
      it: "Le fibre sono la stella silenziosa di ogni alimentazione sana. Non sono un nutriente in senso classico (il tuo corpo non le digerisce), ma sono il motore del tuo intestino. Rallentano l'assorbimento dello zucchero, formando nell'intestino un gel che rilascia il glucosio più lentamente. Legano i grassi – alcune fibre possono legare il colesterolo e favorirne l'eliminazione. Saziano a lungo, si gonfiano nello stomaco riducendo così l'apporto calorico. Nutrono la tua flora intestinale – le fibre solubili sono il cibo preferito dei tuoi batteri intestinali buoni. La raccomandazione giornaliera è di almeno 30 grammi."
    ,
      pt: "A fibra é a estrela discreta de qualquer alimentação saudável. Não é um nutriente no sentido clássico (o teu corpo não a digere), mas é o motor do teu intestino. Retarda a absorção de açúcar, formando um gel no intestino que liberta a glicose mais lentamente. Liga gorduras – algumas fibras conseguem ligar o colesterol e ajudar a excretá-lo. Sacia por mais tempo, incha no estômago e assim reduz a ingestão calórica. Alimenta a tua flora intestinal – a fibra solúvel é o alimento preferido das tuas bactérias intestinais boas. A recomendação diária é de pelo menos 30 gramas.",
      fr: "Les fibres sont la star discrète de toute alimentation saine. Ce ne sont pas des nutriments au sens classique (ton corps ne les digère pas), mais elles sont le moteur de ton intestin. Elles ralentissent l'absorption du sucre en formant un gel dans l'intestin qui libère le glucose plus lentement. Elles fixent les graisses – certaines fibres peuvent lier le cholestérol et favoriser son élimination. Elles rassasient durablement, gonflent dans l'estomac et réduisent ainsi l'apport calorique. Elles nourrissent ta flore intestinale – les fibres solubles sont l'aliment préféré de tes bonnes bactéries intestinales. La recommandation quotidienne est d'au moins 30 grammes.",
      tr: "Lif, sağlıklı beslenmenin sessiz yıldızıdır. Klasik anlamda bir besin öğesi değildir (vücudun onu sindiremez), ama bağırsağının çalışkan atıdır. Şeker emilimini yavaşlatır; bağırsakta glikozu daha yavaş salan bir jel oluşturur. Yağları bağlar – bazı lifler kolesterolü bağlayıp atılmasını sağlayabilir. Uzun süre tok tutar; midede şişerek kalori alımını azaltır. Bağırsak floranı besler – çözünür lif, iyi bağırsak bakterilerinin en sevdiği besindir. Günlük önerilen miktar en az 30 gramdır."
    },
    deepDive: {
      de: "Es gibt zwei Hauptarten von Ballaststoffen: löslich (Hafer, Gerste, Hülsenfrüchte) und unlöslich (Weizenkleie, Gemüse). Beide wirken unterschiedlich – lösliche verlangsamen die Aufnahme und können Cholesterin und Blutzucker mitbeeinflussen, unlösliche fördern die Darmbewegung.",
      en: "There are two main types of fiber: soluble (oats, barley, legumes) and insoluble (wheat bran, vegetables). Both act differently – soluble slows absorption and can influence cholesterol and blood sugar, insoluble promotes bowel movement.",
      es: "Existen dos tipos principales de fibra: soluble (avena, cebada, legumbres) e insoluble (salvado de trigo, verduras). Ambas actúan de forma distinta – la soluble ralentiza la absorción y puede influir en el colesterol y la glucosa, la insoluble favorece el tránsito intestinal.",
      it: "Esistono due tipi principali di fibre: solubili (avena, orzo, legumi) e insolubili (crusca di frumento, verdura). Entrambe agiscono in modo diverso – le solubili rallentano l'assorbimento e possono influenzare colesterolo e glicemia, le insolubili favoriscono la motilità intestinale."
    ,
      pt: "Existem dois tipos principais de fibra: solúvel (aveia, cevada, leguminosas) e insolúvel (farelo de trigo, vegetais). Ambas atuam de forma diferente – a solúvel retarda a absorção e pode influenciar o colesterol e a glicemia, a insolúvel favorece o trânsito intestinal.",
      fr: "Il existe deux grands types de fibres : solubles (avoine, orge, légumineuses) et insolubles (son de blé, légumes). Elles agissent différemment – les solubles ralentissent l'absorption et peuvent influencer le cholestérol et la glycémie, les insolubles favorisent le transit intestinal.",
      tr: "İki ana lif türü vardır: çözünür (yulaf, arpa, baklagiller) ve çözünmez (buğday kepeği, sebzeler). İkisi farklı çalışır – çözünür lif emilimi yavaşlatır ve kolesterol ile kan şekerini etkileyebilir, çözünmez lif bağırsak hareketini destekler."
    },
    personalized: false
  },
  {
    id: 5,
    icon: "📊",
    title: {
      de: "Glykämischer Index (GI)",
      en: "Glycemic Index (GI)",
      es: "Índice Glucémico (IG)",
      it: "Indice Glicemico (IG)"
    ,
      pt: "Índice Glicémico (IG)",
      fr: "Index Glycémique (IG)",
      tr: "Glisemik İndeks (Gİ)"
    },
    summary: {
      de: "Der GI sagt, wie schnell ein Lebensmittel den Blutzucker ansteigen lässt – aber er betrachtet Lebensmittel isoliert. Die glykämische Last (GL) ist oft aussagekräftiger.",
      en: "The GI tells you how fast a food raises blood sugar – but it looks at foods in isolation. The glycemic load (GL) is often more meaningful.",
      es: "El IG indica lo rápido que un alimento eleva el azúcar en sangre – pero considera los alimentos de forma aislada. La carga glucémica (CG) suele ser más informativa.",
      it: "L'IG indica quanto velocemente un alimento fa salire la glicemia – ma considera gli alimenti in modo isolato. Il carico glicemico (CG) è spesso più significativo."
    ,
      pt: "O IG indica a rapidez com que um alimento eleva a glicemia – mas considera os alimentos isoladamente. A carga glicémica (CG) costuma ser mais informativa.",
      fr: "L'IG indique la vitesse à laquelle un aliment fait monter la glycémie – mais il considère les aliments isolément. La charge glycémique (CG) est souvent plus parlante.",
      tr: "Gİ, bir gıdanın kan şekerini ne kadar hızlı yükselttiğini gösterir – ancak gıdaları tek başına değerlendirir. Glisemik yük (GY) genellikle daha anlamlıdır."
    },
    mainContent: {
      de: "Der glykämische Index (GI) ist eine Zahl von 0 bis 100, die angibt, wie schnell ein kohlenhydrathaltiges Lebensmittel den Blutzucker ansteigen lässt. Ein GI von 100 wäre reine Glukose. Die vier GI-Stufen: Niedrig (0–30, z.B. Linsen), Mittel (31–55, z.B. Haferflocken), Hoch (56–69, z.B. Weißbrot) und Sehr hoch (70–100, z.B. Glukose). Das Problem: Der GI betrachtet ein Lebensmittel isoliert – ohne Fett, ohne Eiweiß, ohne andere Lebensmittel. Fett und Eiweiß senken den gesamten glykämischen Effekt einer Mahlzeit massiv. Besser ist die glykämische Last (GL), die zusätzlich die Kohlenhydratmenge berücksichtigt.",
      en: "The glycemic index (GI) is a number from 0 to 100 indicating how fast a carbohydrate-containing food raises blood sugar. A GI of 100 would be pure glucose. The four GI levels: Low (0–30, e.g. lentils), Medium (31–55, e.g. oats), High (56–69, e.g. white bread), and Very high (70–100, e.g. glucose). The problem: the GI looks at a food in isolation – without fat, without protein, without other foods. Fat and protein massively lower the overall glycemic effect of a meal. The glycemic load (GL), which additionally factors in the amount of carbohydrate, is more useful.",
      es: "El índice glucémico (IG) es un número de 0 a 100 que indica lo rápido que un alimento con carbohidratos eleva el azúcar en sangre. Un IG de 100 sería glucosa pura. Los cuatro niveles de IG: bajo (0–30, p. ej. lentejas), medio (31–55, p. ej. copos de avena), alto (56–69, p. ej. pan blanco) y muy alto (70–100, p. ej. glucosa). El problema: el IG considera un alimento de forma aislada – sin grasa, sin proteína, sin otros alimentos. La grasa y la proteína reducen enormemente el efecto glucémico total de una comida. Es más útil la carga glucémica (CG), que además tiene en cuenta la cantidad de carbohidratos.",
      it: "L'indice glicemico (IG) è un numero da 0 a 100 che indica quanto velocemente un alimento contenente carboidrati fa salire la glicemia. Un IG di 100 corrisponderebbe al glucosio puro. I quattro livelli di IG: basso (0–30, es. lenticchie), medio (31–55, es. fiocchi d'avena), alto (56–69, es. pane bianco) e molto alto (70–100, es. glucosio). Il problema: l'IG considera un alimento isolatamente – senza grassi, senza proteine, senza altri alimenti. Grassi e proteine riducono notevolmente l'effetto glicemico complessivo di un pasto. Più utile è il carico glicemico (CG), che considera anche la quantità di carboidrati."
    ,
      pt: "O índice glicémico (IG) é um número de 0 a 100 que indica a rapidez com que um alimento com hidratos de carbono eleva a glicemia. Um IG de 100 seria glicose pura. Os quatro níveis de IG: Baixo (0–30, por exemplo lentilhas), Médio (31–55, por exemplo aveia), Alto (56–69, por exemplo pão branco) e Muito alto (70–100, por exemplo glicose). O problema: o IG considera um alimento isoladamente – sem gordura, sem proteína, sem outros alimentos. A gordura e a proteína reduzem drasticamente o efeito glicémico total de uma refeição. Mais útil é a carga glicémica (CG), que considera adicionalmente a quantidade de hidratos de carbono.",
      fr: "L'index glycémique (IG) est un chiffre de 0 à 100 qui indique la vitesse à laquelle un aliment contenant des glucides fait monter la glycémie. Un IG de 100 correspondrait au glucose pur. Les quatre niveaux d'IG : bas (0–30, par ex. lentilles), moyen (31–55, par ex. flocons d'avoine), élevé (56–69, par ex. pain blanc) et très élevé (70–100, par ex. glucose). Le problème : l'IG considère un aliment isolément – sans matière grasse, sans protéines, sans autres aliments. Les graisses et les protéines réduisent fortement l'effet glycémique global d'un repas. La charge glycémique (CG), qui prend en plus en compte la quantité de glucides, est plus pertinente.",
      tr: "Glisemik indeks (Gİ), karbonhidrat içeren bir gıdanın kan şekerini ne kadar hızlı yükselttiğini gösteren 0 ile 100 arasında bir sayıdır. 100 Gİ değeri saf glikoza karşılık gelir. Dört Gİ seviyesi: Düşük (0-30, örneğin mercimek), Orta (31-55, örneğin yulaf ezmesi), Yüksek (56-69, örneğin beyaz ekmek) ve Çok yüksek (70-100, örneğin glikoz). Sorun şu: Gİ, bir gıdayı tek başına değerlendirir – yağ, protein veya diğer gıdalar olmadan. Yağ ve protein, bir öğünün toplam glisemik etkisini büyük ölçüde azaltır. Karbonhidrat miktarını da hesaba katan glisemik yük (GY) daha kullanışlıdır."
    },
    deepDive: {
      de: "Die glykämische Last berechnet sich als GI multipliziert mit der Kohlenhydratmenge (in Gramm) geteilt durch 100. Beispiel: Wassermelone hat einen hohen GI (72), aber nur 5 g Kohlenhydrate pro 100 g – die GL ist niedrig. Pommes haben einen mittleren GI, aber viele Kohlenhydrate – die GL ist hoch.",
      en: "The glycemic load is calculated as GI multiplied by the carbohydrate amount (in grams), divided by 100. Example: watermelon has a high GI (72) but only 5 g of carbohydrate per 100 g – its GL is low. Fries have a medium GI but a lot of carbohydrate – their GL is high.",
      es: "La carga glucémica se calcula como el IG multiplicado por la cantidad de carbohidratos (en gramos), dividido entre 100. Ejemplo: la sandía tiene un IG alto (72), pero solo 5 g de carbohidratos por cada 100 g – su CG es baja. Las patatas fritas tienen un IG medio, pero muchos carbohidratos – su CG es alta.",
      it: "Il carico glicemico si calcola moltiplicando l'IG per la quantità di carboidrati (in grammi) e dividendo per 100. Esempio: l'anguria ha un IG alto (72), ma solo 5 g di carboidrati per 100 g – il suo CG è basso. Le patatine fritte hanno un IG medio, ma molti carboidrati – il loro CG è alto."
    ,
      pt: "A carga glicémica calcula-se multiplicando o IG pela quantidade de hidratos de carbono (em gramas) e dividindo por 100. Exemplo: a melancia tem um IG alto (72), mas apenas 5 g de hidratos de carbono por 100 g – a sua CG é baixa. As batatas fritas têm um IG médio, mas muitos hidratos de carbono – a sua CG é alta.",
      fr: "La charge glycémique se calcule en multipliant l'IG par la quantité de glucides (en grammes), puis en divisant par 100. Exemple : la pastèque a un IG élevé (72), mais seulement 5 g de glucides pour 100 g – sa CG est basse. Les frites ont un IG moyen, mais beaucoup de glucides – leur CG est élevée.",
      tr: "Glisemik yük, Gİ'nin karbonhidrat miktarıyla (gram cinsinden) çarpılıp 100'e bölünmesiyle hesaplanır. Örnek: Karpuzun Gİ değeri yüksektir (72), ancak 100 gramında sadece 5 g karbonhidrat vardır – GY değeri düşüktür. Patates kızartmasının Gİ değeri ortadır, ancak karbonhidrat miktarı fazladır – GY değeri yüksektir."
    },
    personalized: false
  },
  {
    id: 6,
    icon: "🧮",
    title: {
      de: "Netto-Kohlenhydrate",
      en: "Net Carbs",
      es: "Carbohidratos netos",
      it: "Carboidrati netti"
    ,
      pt: "Hidratos de carbono líquidos",
      fr: "Glucides nets",
      tr: "Net Karbonhidrat"
    },
    summary: {
      de: "Netto-Kohlenhydrate = Gesamt-Kohlenhydrate minus Ballaststoffe. Das ist der wahre Wert, der deinen Blutzucker und deine Triglyceride beeinflusst.",
      en: "Net carbs = total carbohydrates minus fiber. That's the real number that affects your blood sugar and your triglycerides.",
      es: "Carbohidratos netos = carbohidratos totales menos fibra. Ese es el valor real que afecta a tu glucosa y a tus triglicéridos.",
      it: "Carboidrati netti = carboidrati totali meno le fibre. Questo è il valore reale che influisce sulla tua glicemia e sui tuoi trigliceridi."
    ,
      pt: "Hidratos de carbono líquidos = hidratos de carbono totais menos fibra. Este é o valor real que afeta a tua glicemia e os teus triglicéridos.",
      fr: "Glucides nets = glucides totaux moins fibres. C'est la valeur réelle qui influence ta glycémie et tes triglycérides.",
      tr: "Net karbonhidrat = toplam karbonhidrat eksi lif. Bu, kan şekerini ve trigliseritlerini etkileyen gerçek değerdir."
    },
    mainContent: {
      de: "Du siehst auf Verpackungen einen Kohlenhydrat-Wert – aber der ist oft nicht die ganze Wahrheit. Die Netto-Kohlenhydrate (oder verwertbare Kohlenhydrate) sind das, was dein Körper tatsächlich in Glukose umwandeln kann. Die Formel lautet: Netto-Kohlenhydrate = Gesamt-Kohlenhydrate minus Ballaststoffe. Ballaststoffe sind Kohlenhydrate, aber dein Körper kann sie nicht verdauen. Wenn du ein Lebensmittel mit 30 g Kohlenhydraten und 10 g Ballaststoffen isst, nimmt dein Körper nur etwa 20 g auf. Praktisches Beispiel: Weizenbrot (hell) hat 50 g KH und 3 g Ballaststoffe = 47 g Netto-KH. Vollkornbrot hat 45 g KH und 10 g Ballaststoffe = 35 g Netto-KH.",
      en: "You see a carbohydrate value on packaging – but it's often not the whole truth. Net carbs (or usable carbohydrates) are what your body can actually convert into glucose. The formula is: net carbs = total carbohydrates minus fiber. Fiber is a carbohydrate, but your body can't digest it. If you eat a food with 30 g of carbohydrate and 10 g of fiber, your body only absorbs about 20 g. Practical example: white wheat bread has 50 g carbs and 3 g fiber = 47 g net carbs. Whole grain bread has 45 g carbs and 10 g fiber = 35 g net carbs.",
      es: "En los envases ves un valor de carbohidratos – pero a menudo no es toda la verdad. Los carbohidratos netos (o carbohidratos aprovechables) son lo que tu cuerpo realmente puede convertir en glucosa. La fórmula es: carbohidratos netos = carbohidratos totales menos fibra. La fibra es un carbohidrato, pero tu cuerpo no puede digerirla. Si comes un alimento con 30 g de carbohidratos y 10 g de fibra, tu cuerpo solo absorbe unos 20 g. Ejemplo práctico: el pan de trigo blanco tiene 50 g de carbohidratos y 3 g de fibra = 47 g de carbohidratos netos. El pan integral tiene 45 g de carbohidratos y 10 g de fibra = 35 g de carbohidratos netos.",
      it: "Sulle confezioni vedi un valore di carboidrati – ma spesso non è tutta la verità. I carboidrati netti (o carboidrati utilizzabili) sono ciò che il tuo corpo può effettivamente trasformare in glucosio. La formula è: carboidrati netti = carboidrati totali meno le fibre. Le fibre sono un carboidrato, ma il tuo corpo non riesce a digerirle. Se mangi un alimento con 30 g di carboidrati e 10 g di fibre, il tuo corpo ne assorbe solo circa 20 g. Esempio pratico: il pane bianco di frumento ha 50 g di carboidrati e 3 g di fibre = 47 g di carboidrati netti. Il pane integrale ha 45 g di carboidrati e 10 g di fibre = 35 g di carboidrati netti."
    ,
      pt: "Vês nas embalagens um valor de hidratos de carbono – mas muitas vezes não é toda a verdade. Os hidratos de carbono líquidos (ou hidratos de carbono aproveitáveis) são aquilo que o teu corpo consegue realmente converter em glicose. A fórmula é: hidratos de carbono líquidos = hidratos de carbono totais menos fibra. A fibra é um hidrato de carbono, mas o teu corpo não a consegue digerir. Se comeres um alimento com 30 g de hidratos de carbono e 10 g de fibra, o teu corpo absorve apenas cerca de 20 g. Exemplo prático: o pão de trigo (branco) tem 50 g de HC e 3 g de fibra = 47 g de HC líquidos. O pão integral tem 45 g de HC e 10 g de fibra = 35 g de HC líquidos.",
      fr: "Tu vois sur les emballages une valeur de glucides – mais ce n'est souvent pas toute la vérité. Les glucides nets (ou glucides assimilables) sont ce que ton corps peut réellement convertir en glucose. La formule est : glucides nets = glucides totaux moins fibres. Les fibres sont des glucides, mais ton corps ne peut pas les digérer. Si tu manges un aliment avec 30 g de glucides et 10 g de fibres, ton corps n'en absorbe qu'environ 20 g. Exemple pratique : le pain de blé (blanc) contient 50 g de glucides et 3 g de fibres = 47 g de glucides nets. Le pain complet contient 45 g de glucides et 10 g de fibres = 35 g de glucides nets.",
      tr: "Ambalajlarda bir karbonhidrat değeri görürsün – ama bu genellikle işin tamamı değildir. Net karbonhidrat (veya kullanılabilir karbonhidrat), vücudunun gerçekten glikoza dönüştürebildiği miktardır. Formül şudur: net karbonhidrat = toplam karbonhidrat eksi lif. Lif bir karbonhidrattır, ama vücudun onu sindiremez. 30 g karbonhidrat ve 10 g lif içeren bir gıda yersen, vücudun yaklaşık sadece 20 g'ını emer. Pratik örnek: beyaz buğday ekmeğinde 50 g karbonhidrat ve 3 g lif vardır = 47 g net karbonhidrat. Tam tahıllı ekmekte 45 g karbonhidrat ve 10 g lif vardır = 35 g net karbonhidrat."
    },
    deepDive: {
      de: "In einigen Ländern werden auch Zuckeralkohole (z.B. Xylit, Erythrit) von den Gesamt-Kohlenhydraten abgezogen, da sie kaum Einfluss auf den Blutzucker haben. In der EU ist das nicht üblich; wer Kohlenhydrate und den Blutzuckerverlauf genau nachvollziehen will, kann den Unterschied dennoch relevant finden.",
      en: "In some countries, sugar alcohols (e.g. xylitol, erythritol) are also subtracted from total carbohydrates, since they have little effect on blood sugar. This isn't common in the EU; anyone tracking carbohydrates and blood-sugar response closely may still find the difference relevant.",
      es: "En algunos países también se restan de los carbohidratos totales los alcoholes de azúcar (p. ej. xilitol, eritritol), ya que apenas afectan al azúcar en sangre. En la UE esto no es habitual; quien quiera seguir de cerca carbohidratos y la evolución de la glucosa puede encontrar la diferencia relevante.",
      it: "In alcuni paesi vengono sottratti dai carboidrati totali anche i polioli (es. xilitolo, eritritolo), poiché hanno scarso effetto sulla glicemia. Nell'UE questo non è comune; chi vuole seguire da vicino carboidrati e andamento della glicemia può comunque trovare rilevante la differenza."
    ,
      pt: "Em alguns países, também se subtraem os álcoois de açúcar (por exemplo, xilitol, eritritol) dos hidratos de carbono totais, uma vez que têm pouco efeito na glicemia. Na UE isso não é habitual; quem quiser acompanhar de perto hidratos de carbono e a evolução da glicemia pode achar a diferença relevante.",
      fr: "Dans certains pays, les polyols (par ex. xylitol, érythritol) sont également soustraits des glucides totaux, car ils ont peu d'effet sur la glycémie. Ce n'est pas courant dans l'UE ; quiconque suit de près glucides et évolution glycémique peut néanmoins trouver la différence pertinente.",
      tr: "Bazı ülkelerde şeker alkolleri (örneğin ksilitol, eritritol) de toplam karbonhidrattan çıkarılır, çünkü kan şekeri üzerinde çok az etkileri vardır. AB'de bu yaygın değildir; karbonhidratları ve kan şekeri seyrini yakından takip etmek isteyenler yine de bu farkı anlamlı bulabilir."
    },
    personalized: true,
    relevantLabKey: "bloodSugar"
  },
  {
    id: 7,
    icon: "🏃",
    title: {
      de: "Bewegung & Kohlenhydrate",
      en: "Exercise & Carbohydrates",
      es: "Ejercicio y carbohidratos",
      it: "Movimento e carboidrati"
    ,
      pt: "Exercício e hidratos de carbono",
      fr: "Activité physique et glucides",
      tr: "Egzersiz ve Karbonhidratlar"
    },
    summary: {
      de: "Bewegung macht deine Zellen wieder empfindlicher für Insulin – und schon 15 Minuten Spaziergang nach einer Mahlzeit können den Anstieg des Blutzuckers nach dem Essen spürbar abmildern.",
      en: "Exercise makes your cells more sensitive to insulin again – and just 15 minutes of walking after a meal can noticeably soften the post-meal rise in blood sugar.",
      es: "El ejercicio vuelve a hacer tus células más sensibles a la insulina – y solo 15 minutos de paseo después de comer pueden suavizar de forma perceptible el aumento de glucosa tras la comida.",
      it: "Il movimento rende le tue cellule di nuovo più sensibili all'insulina – e bastano 15 minuti di camminata dopo un pasto per attenuare in modo percepibile l'aumento della glicemia dopo il pasto."
    ,
      pt: "O exercício torna as tuas células novamente mais sensíveis à insulina – e apenas 15 minutos de caminhada após uma refeição podem amenizar de forma percetível a subida da glicemia após a refeição.",
      fr: "L'activité physique rend tes cellules à nouveau plus sensibles à l'insuline – et seulement 15 minutes de marche après un repas peuvent atténuer de façon perceptible la hausse de glycémie après le repas.",
      tr: "Egzersiz, hücrelerini insüline karşı yeniden daha duyarlı hale getirir – ve bir öğünden sonra sadece 15 dakikalık yürüyüş, yemek sonrası kan şekeri yükselişini belirgin şekilde yumuşatabilir."
    },
    mainContent: {
      de: "Ernährung ist nur die eine Hälfte der Medaille. Die andere Hälfte ist Bewegung. Deine Muskeln speichern Kohlenhydrate in Form von Glykogen. Wenn du dich bewegst, entleeren sich diese Speicher. Nach dem Sport sind die Muskeln wie ein Schwamm: Sie saugen Glukose aus dem Blut auf – ohne dass viel Insulin dafür nötig ist. Regelmäßige Bewegung geht oft mit niedrigeren Triglyceriden, ruhigerem Blutzuckerverlauf, besserer Insulinempfindlichkeit und höherem HDL einher. Die Praxis-Tipps: 10–15 Minuten Spaziergang nach den Mahlzeiten, drei Einheiten pro Woche à 30 Minuten moderates Tempo, und Muskelaufbau als zusätzlicher Glukose-Speicher.",
      en: "Nutrition is only half the equation. The other half is movement. Your muscles store carbohydrates as glycogen. When you move, these stores empty. After exercise, your muscles act like a sponge: they soak up glucose from the blood – without needing much insulin to do so. Regular exercise often goes with lower triglycerides, a steadier blood-sugar pattern, better insulin sensitivity, and higher HDL. Practical tips: a 10–15 minute walk after meals, three sessions per week of 30 minutes at a moderate pace, and building muscle as extra glucose storage.",
      es: "La alimentación es solo la mitad de la ecuación. La otra mitad es el movimiento. Tus músculos almacenan carbohidratos en forma de glucógeno. Cuando te mueves, estos depósitos se vacían. Después del ejercicio, los músculos actúan como una esponja: absorben glucosa de la sangre – sin necesitar apenas insulina para ello. El ejercicio regular suele ir acompañado de triglicéridos más bajos, un patrón de glucosa más estable, mejor sensibilidad a la insulina y HDL más alto. Consejos prácticos: un paseo de 10–15 minutos después de las comidas, tres sesiones semanales de 30 minutos a ritmo moderado, y desarrollar músculo como depósito extra de glucosa.",
      it: "L'alimentazione è solo metà dell'equazione. L'altra metà è il movimento. I tuoi muscoli immagazzinano carboidrati sotto forma di glicogeno. Quando ti muovi, queste riserve si svuotano. Dopo lo sport, i muscoli agiscono come una spugna: assorbono il glucosio dal sangue – senza bisogno di molta insulina. Il movimento regolare spesso va di pari passo con trigliceridi più bassi, un andamento glicemico più stabile, migliore sensibilità all'insulina e HDL più alto. Consigli pratici: una camminata di 10–15 minuti dopo i pasti, tre sessioni a settimana da 30 minuti a ritmo moderato, e lo sviluppo muscolare come riserva extra di glucosio."
    ,
      pt: "A alimentação é apenas metade da equação. A outra metade é o exercício. Os teus músculos armazenam hidratos de carbono sob a forma de glicogénio. Quando te movimentas, estas reservas esvaziam-se. Depois do exercício, os músculos funcionam como uma esponja: absorvem glicose do sangue – sem que seja necessária muita insulina para isso. O exercício regular costuma acompanhar-se de triglicéridos mais baixos, um padrão de glicemia mais estável, melhor sensibilidade à insulina e HDL mais alto. Dicas práticas: caminhada de 10–15 minutos após as refeições, três sessões por semana de 30 minutos a ritmo moderado, e desenvolvimento muscular como reserva extra de glicose.",
      fr: "L'alimentation n'est que la moitié de l'équation. L'autre moitié, c'est l'activité physique. Tes muscles stockent les glucides sous forme de glycogène. Quand tu bouges, ces réserves se vident. Après le sport, les muscles agissent comme une éponge : ils absorbent le glucose du sang – sans avoir besoin de beaucoup d'insuline pour cela. L'activité physique régulière s'accompagne souvent de triglycérides plus bas, d'une glycémie plus stable, d'une meilleure sensibilité à l'insuline et d'un HDL plus élevé. Conseils pratiques : une marche de 10 à 15 minutes après les repas, trois séances par semaine de 30 minutes à rythme modéré, et le renforcement musculaire comme réserve supplémentaire de glucose.",
      tr: "Beslenme denklemin sadece yarısıdır. Diğer yarısı harekettir. Kasların, karbonhidratları glikojen şeklinde depolar. Hareket ettiğinde bu depolar boşalır. Sporun ardından kaslar bir sünger gibi davranır: kandaki glikozu emerler – bunun için fazla insüline ihtiyaç duymadan. Düzenli egzersiz çoğu zaman daha düşük trigliseritler, daha sakin bir kan şekeri seyri, daha iyi insülin duyarlılığı ve daha yüksek HDL ile birlikte gider. Pratik ipuçları: öğünlerden sonra 10-15 dakikalık yürüyüş, haftada üç kez 30 dakikalık orta tempolu egzersiz ve ekstra glikoz deposu olarak kas geliştirme."
    },
    deepDive: {
      de: "Der Effekt der Bewegung auf die Insulinsensitivität hält bis zu 48 Stunden an. Das bedeutet: Regelmäßige Bewegung (nicht unbedingt täglich) ist effektiver als ein einziger intensiver Sporttag pro Woche.",
      en: "The effect of exercise on insulin sensitivity lasts up to 48 hours. That means: regular exercise (not necessarily daily) is more effective than a single intense workout day per week.",
      es: "El efecto del ejercicio sobre la sensibilidad a la insulina dura hasta 48 horas. Esto significa que el ejercicio regular (no necesariamente diario) es más eficaz que un único día de entrenamiento intenso a la semana.",
      it: "L'effetto del movimento sulla sensibilità all'insulina dura fino a 48 ore. Questo significa che il movimento regolare (non necessariamente quotidiano) è più efficace di un solo giorno di allenamento intenso a settimana."
    ,
      pt: "O efeito do exercício na sensibilidade à insulina dura até 48 horas. Isto significa que o exercício regular (não necessariamente diário) é mais eficaz do que um único dia de treino intenso por semana.",
      fr: "L'effet de l'activité physique sur la sensibilité à l'insuline dure jusqu'à 48 heures. Cela signifie qu'une activité physique régulière (pas nécessairement quotidienne) est plus efficace qu'une seule séance de sport intense par semaine.",
      tr: "Egzersizin insülin duyarlılığı üzerindeki etkisi 48 saate kadar sürer. Bu, düzenli egzersizin (mutlaka her gün olmasa da) haftada bir kez yapılan yoğun bir antrenman gününden daha etkili olduğu anlamına gelir."
    },
    personalized: false
  },
  {
    id: 8,
    icon: "💡",
    title: {
      de: "Praktische Tipps für den Alltag",
      en: "Practical Tips for Everyday Life",
      es: "Consejos prácticos para el día a día",
      it: "Consigli pratici per la vita quotidiana"
    ,
      pt: "Dicas práticas para o dia a dia",
      fr: "Conseils pratiques pour le quotidien",
      tr: "Günlük Hayat İçin Pratik İpuçları"
    },
    summary: {
      de: "10 einfache, sofort umsetzbare Hebel – von der 5-Sekunden-Regel beim Einkauf bis zur Essensreihenfolge am Tisch.",
      en: "10 simple, immediately actionable levers – from the 5-second rule while shopping to the order you eat your food at the table.",
      es: "10 palancas sencillas y aplicables de inmediato – desde la regla de los 5 segundos al comprar hasta el orden en que comes en la mesa.",
      it: "10 leve semplici e subito applicabili – dalla regola dei 5 secondi durante la spesa all'ordine in cui mangi a tavola."
    ,
      pt: "10 alavancas simples e imediatamente aplicáveis – desde a regra dos 5 segundos nas compras até à ordem das refeições à mesa.",
      fr: "10 leviers simples et immédiatement applicables – de la règle des 5 secondes en faisant les courses à l'ordre des aliments à table.",
      tr: "Alışverişteki 5 saniye kuralından masadaki yemek sırasına kadar 10 basit ve hemen uygulanabilir yöntem."
    },
    mainContent: {
      de: "Theorie ist gut, Praxis ist besser. Die Top 10 Alltags-Tipps: 1. Die 5-Sekunden-Regel – Zucker in den ersten 3 Positionen? Liegen lassen. 2. Trink nicht deine Kalorien – Wasser oder ungesüßter Tee statt Softdrinks. 3. Die Hälfte des Tellers mit Gemüse füllen. 4. Essensreihenfolge: Gemüse → Eiweiß → Kohlenhydrate. 5. Kein Alkohol auf leeren Magen. 6. Gute Fette einbauen (Olivenöl, Nüsse). 7. Meal Prep – für 2–3 Tage vorkochen. 8. Die 20-Minuten-Regel – langsam essen. 9. Schlaf nicht unterschätzen – weniger als 6 Stunden fördert Insulinresistenz. 10. Ein Tag pro Woche bewusst ballaststoffreich und zuckerarm.",
      en: "Theory is good, practice is better. The top 10 everyday tips: 1. The 5-second rule – sugar in the first 3 ingredients? Leave it on the shelf. 2. Don't drink your calories – water or unsweetened tea instead of soft drinks. 3. Fill half your plate with vegetables. 4. Order of eating: vegetables → protein → carbohydrates. 5. No alcohol on an empty stomach. 6. Include good fats (olive oil, nuts). 7. Meal prep – cook ahead for 2–3 days. 8. The 20-minute rule – eat slowly. 9. Don't underestimate sleep – less than 6 hours promotes insulin resistance. 10. One day a week deliberately high in fiber and low in sugar.",
      es: "La teoría está bien, la práctica es mejor. Los 10 mejores consejos para el día a día: 1. La regla de los 5 segundos – ¿azúcar entre los 3 primeros ingredientes? Déjalo en el estante. 2. No bebas tus calorías – agua o té sin azúcar en vez de refrescos. 3. Llena la mitad del plato con verduras. 4. Orden de la comida: verduras → proteína → carbohidratos. 5. Nada de alcohol con el estómago vacío. 6. Incorpora grasas buenas (aceite de oliva, frutos secos). 7. Meal prep – cocina con antelación para 2–3 días. 8. La regla de los 20 minutos – come despacio. 9. No subestimes el sueño – menos de 6 horas favorece la resistencia a la insulina. 10. Un día a la semana deliberadamente rico en fibra y bajo en azúcar.",
      it: "La teoria è utile, la pratica è meglio. I 10 migliori consigli quotidiani: 1. La regola dei 5 secondi – zucchero tra i primi 3 ingredienti? Lascialo sullo scaffale. 2. Non bere le tue calorie – acqua o tè non zuccherato invece di bibite gassate. 3. Riempi metà del piatto con verdure. 4. Ordine dei cibi: verdure → proteine → carboidrati. 5. Niente alcol a stomaco vuoto. 6. Inserisci grassi buoni (olio d'oliva, frutta secca). 7. Meal prep – cucina in anticipo per 2–3 giorni. 8. La regola dei 20 minuti – mangia lentamente. 9. Non sottovalutare il sonno – meno di 6 ore favorisce la resistenza all'insulina. 10. Un giorno a settimana volutamente ricco di fibre e povero di zuccheri."
    ,
      pt: "A teoria é boa, a prática é melhor. As 10 melhores dicas para o dia a dia: 1. A regra dos 5 segundos – açúcar entre os 3 primeiros ingredientes? Deixa ficar na prateleira. 2. Não bebas as tuas calorias – água ou chá sem açúcar em vez de refrigerantes. 3. Preenche metade do prato com vegetais. 4. Ordem das refeições: vegetais → proteína → hidratos de carbono. 5. Nada de álcool com o estômago vazio. 6. Inclui gorduras boas (azeite, frutos secos). 7. Meal prep – cozinha com antecedência para 2–3 dias. 8. A regra dos 20 minutos – come devagar. 9. Não subestimes o sono – menos de 6 horas favorece a resistência à insulina. 10. Um dia por semana deliberadamente rico em fibra e pobre em açúcar.",
      fr: "La théorie c'est bien, la pratique c'est mieux. Le top 10 des conseils du quotidien : 1. La règle des 5 secondes – du sucre parmi les 3 premiers ingrédients ? Laisse-le sur l'étagère. 2. Ne bois pas tes calories – de l'eau ou du thé non sucré plutôt que des sodas. 3. Remplis la moitié de ton assiette de légumes. 4. Ordre des aliments : légumes → protéines → glucides. 5. Pas d'alcool à jeun. 6. Intègre de bonnes graisses (huile d'olive, noix). 7. Meal prep – cuisine à l'avance pour 2 à 3 jours. 8. La règle des 20 minutes – mange lentement. 9. Ne sous-estime pas le sommeil – moins de 6 heures favorise la résistance à l'insuline. 10. Une journée par semaine délibérément riche en fibres et pauvre en sucre.",
      tr: "Teori iyidir, uygulama daha iyidir. Günlük hayat için en iyi 10 ipucu: 1. 5 saniye kuralı – şeker ilk 3 malzeme arasında mı? Rafta bırak. 2. Kalorilerini içme – gazlı içecekler yerine su veya şekersiz çay iç. 3. Tabağının yarısını sebzeyle doldur. 4. Yemek sırası: sebze → protein → karbonhidrat. 5. Aç karnına asla alkol alma. 6. İyi yağları dahil et (zeytinyağı, kuruyemiş). 7. Meal prep – 2-3 gün için önceden pişir. 8. 20 dakika kuralı – yavaş ye. 9. Uykuyu hafife alma – 6 saatten az uyku insülin direncini artırır. 10. Haftada bir gün bilinçli olarak lif açısından zengin, şeker açısından az beslen."
    },
    deepDive: {
      de: "Die Essensreihenfolge ist wissenschaftlich gut belegt: Studien zeigen, dass der Blutzucker nach einer Mahlzeit niedriger ausfallen kann, wenn die Reihenfolge Gemüse → Eiweiß → Kohlenhydrate eingehalten wird – ohne dass sich die Lebensmittel ändern.",
      en: "The order of eating is well supported by science: studies show blood sugar after a meal can come out lower when the order vegetables → protein → carbohydrates is followed – without changing the foods themselves.",
      es: "El orden de la comida está bien respaldado científicamente: los estudios muestran que la glucosa después de una comida puede resultar más baja cuando se sigue el orden verduras → proteína → carbohidratos – sin cambiar los alimentos en sí.",
      it: "L'ordine dei cibi è ben documentato scientificamente: gli studi mostrano che la glicemia dopo un pasto può risultare più bassa se si segue l'ordine verdure → proteine → carboidrati – senza cambiare gli alimenti stessi."
    ,
      pt: "A ordem das refeições está bem comprovada cientificamente: estudos mostram que a glicemia após uma refeição pode ficar mais baixa quando se segue a ordem vegetais → proteína → hidratos de carbono – sem alterar os alimentos em si.",
      fr: "L'ordre des aliments est bien étayé scientifiquement : des études montrent que la glycémie après un repas peut être plus basse lorsque l'ordre légumes → protéines → glucides est respecté – sans changer les aliments eux-mêmes.",
      tr: "Yemek sırası bilimsel olarak iyi kanıtlanmıştır: çalışmalar, sebze → protein → karbonhidrat sırası izlendiğinde bir öğünden sonraki kan şekerinin, gıdalar değişmeden daha düşük olabileceğini göstermektedir."
    },
    personalized: false
  },
  {
    id: 9,
    icon: "🔬",
    title: {
      de: "Laborwerte verstehen",
      en: "Understanding Lab Values",
      es: "Entender los valores de laboratorio",
      it: "Capire i valori di laboratorio"
    ,
      pt: "Compreender os valores laboratoriais",
      fr: "Comprendre les valeurs de laboratoire",
      tr: "Laboratuvar Değerlerini Anlamak"
    },
    summary: {
      de: "Ein Überblick über die wichtigsten Werte – Triglyceride, LDL, HDL, Blutzucker, HbA1c, Blutdruck – und was sie über deinen Stoffwechsel aussagen.",
      en: "An overview of the key values – triglycerides, LDL, HDL, blood sugar, HbA1c, blood pressure – and what they say about your metabolism.",
      es: "Un resumen de los valores más importantes – triglicéridos, LDL, HDL, glucosa, HbA1c, presión arterial – y qué dicen sobre tu metabolismo.",
      it: "Una panoramica dei valori più importanti – trigliceridi, LDL, HDL, glicemia, HbA1c, pressione arteriosa – e cosa dicono sul tuo metabolismo."
    ,
      pt: "Uma visão geral dos valores mais importantes – triglicéridos, LDL, HDL, glicemia, HbA1c, pressão arterial – e o que dizem sobre o teu metabolismo.",
      fr: "Un aperçu des valeurs les plus importantes – triglycérides, LDL, HDL, glycémie, HbA1c, tension artérielle – et ce qu'elles disent de ton métabolisme.",
      tr: "En önemli değerlere genel bir bakış – trigliserit, LDL, HDL, kan şekeri, HbA1c, kan basıncı – ve bunların metabolizman hakkında söyledikleri."
    },
    mainContent: {
      de: "Dein Arzt schickt dir einen Laborzettel – und du siehst nur Zahlen und Abkürzungen. Triglyceride zeigen an, wie viel Fett du gerade im Blut transportierst. LDL transportiert Cholesterin zu den Geweben; HDL bringt überschüssiges Cholesterin zurück zur Leber. Der Nüchtern-Blutzucker gibt einen Hinweis darauf, wie dein Körper die Glukose über Nacht reguliert. Der HbA1c spiegelt den Durchschnitt der letzten 8–12 Wochen wider. Der Blutdruck beschreibt den Druck in den Gefäßen. Orientierungsbereiche auf Laborzetteln sind nicht automatisch dein persönliches Ziel – Zielbereiche sind individuell und werden mit einer Fachperson festgelegt. Das Verhältnis der Werte zueinander ist oft aussagekräftiger als einzelne Zahlen – besonders der Quotient aus Triglyceriden und HDL.",
      en: "Your doctor sends you a lab report – and all you see are numbers and abbreviations. Triglycerides show how much fat you're currently transporting in your blood. LDL transports cholesterol to the tissues; HDL brings excess cholesterol back to the liver. Fasting blood sugar hints at how your body regulates glucose overnight. HbA1c reflects the average of the last 8–12 weeks. Blood pressure describes the pressure in the vessels. Reference ranges on lab reports are not automatically your personal target – target ranges are individual and decided with a professional. How values relate to each other is often more meaningful than single numbers – especially the ratio of triglycerides to HDL.",
      es: "Tu médico te entrega un informe de laboratorio – y solo ves números y abreviaturas. Los triglicéridos indican cuánta grasa estás transportando en la sangre en este momento. El LDL transporta colesterol a los tejidos; el HDL lleva el colesterol sobrante de vuelta al hígado. La glucosa en ayunas da una pista de cómo tu cuerpo regula la glucosa durante la noche. La HbA1c refleja el promedio de las últimas 8–12 semanas. La presión arterial describe la presión en los vasos. Los rangos de orientación del informe no son automáticamente tu objetivo personal – los rangos objetivo son individuales y se fijan con un profesional. La relación entre valores suele decir más que cifras sueltas – especialmente el cociente entre triglicéridos y HDL.",
      it: "Il tuo medico ti consegna le analisi del sangue – e vedi solo numeri e sigle. I trigliceridi indicano quanto grasso stai trasportando nel sangue in questo momento. L'LDL trasporta il colesterolo ai tessuti; l'HDL riporta il colesterolo in eccesso al fegato. La glicemia a digiuno dà un indizio su come il corpo regola il glucosio durante la notte. L'HbA1c riflette la media delle ultime 8–12 settimane. La pressione arteriosa descrive la pressione nei vasi. Gli intervalli di orientamento sul referto non sono automaticamente il tuo obiettivo personale – gli intervalli target sono individuali e si decidono con un professionista. Il rapporto tra i valori è spesso più significativo dei singoli numeri – in particolare il rapporto tra trigliceridi e HDL."
    ,
      pt: "O teu médico envia-te uma análise – e vês apenas números e siglas. Os triglicéridos indicam quanta gordura estás a transportar no sangue neste momento. O LDL transporta colesterol para os tecidos; o HDL leva o colesterol em excesso de volta para o fígado. A glicemia em jejum dá uma indicação de como o teu corpo regula a glicose durante a noite. A HbA1c reflecte a média das últimas 8–12 semanas. A pressão arterial descreve a pressão nos vasos. Os intervalos de orientação no relatório não são automaticamente o teu objetivo pessoal – os intervalos-alvo são individuais e decididos com um profissional. A relação entre os valores é muitas vezes mais informativa do que números isolados – especialmente o quociente entre triglicéridos e HDL.",
      fr: "Ton médecin t'envoie un bilan sanguin – et tu ne vois que des chiffres et des abréviations. Les triglycérides indiquent la quantité de graisse que tu transportes actuellement dans le sang. Le LDL transporte le cholestérol vers les tissus ; le HDL ramène l'excès de cholestérol vers le foie. La glycémie à jeun donne une idée de la façon dont ton corps régule le glucose pendant la nuit. L'HbA1c reflète la moyenne des 8 à 12 dernières semaines. La tension artérielle décrit la pression dans les vaisseaux. Les plages d'orientation du bilan ne sont pas automatiquement ton objectif personnel – les plages cibles sont individuelles et se décident avec un professionnel. Le rapport entre les valeurs est souvent plus parlant que les chiffres isolés – en particulier le rapport triglycérides/HDL.",
      tr: "Doktorun sana bir tahlil sonucu gönderir – ve sen sadece sayılar ve kısaltmalar görürsün. Trigliseritler şu anda kanında ne kadar yağ taşıdığını gösterir. LDL kolesterolü dokulara taşır; HDL fazla kolesterolü karaciğere geri götürür. Açlık kan şekeri, vücudunun geceleri glikozu nasıl düzenlediğine dair bir ipucu verir. HbA1c son 8-12 haftanın ortalamasını yansıtır. Kan basıncı damarlardaki basıncı tanımlar. Tahlildeki yönelim aralıkları otomatik olarak senin kişisel hedefin değildir – hedef aralıkları bireyseldir ve bir uzmanla belirlenir. Değerlerin birbirine oranı, tek tek sayılardan çoğu zaman daha anlamlıdır – özellikle trigliserit/HDL oranı."
    },
    deepDive: {
      de: "Wichtiger Hinweis: Zielbereiche – insbesondere beim LDL – sind individuell und werden mit einer Fachperson festgelegt. Orientierungszahlen auf Laborzetteln ersetzen keine persönliche Einordnung.",
      en: "Important note: target ranges – especially for LDL – are individual and decided with a professional. Reference numbers on lab reports do not replace a personal assessment.",
      es: "Aviso importante: los rangos objetivo – especialmente el LDL – son individuales y se fijan con un profesional. Las cifras de orientación del informe no sustituyen una valoración personal.",
      it: "Nota importante: gli intervalli target – in particolare per l'LDL – sono individuali e si decidono con un professionista. I numeri di orientamento sul referto non sostituiscono una valutazione personale."
    ,
      pt: "Nota importante: os intervalos-alvo – especialmente o LDL – são individuais e decididos com um profissional. Os números de orientação no relatório não substituem uma avaliação pessoal.",
      fr: "Remarque importante : les plages cibles – notamment pour le LDL – sont individuelles et se décident avec un professionnel. Les chiffres d'orientation du bilan ne remplacent pas une évaluation personnelle.",
      tr: "Önemli not: özellikle LDL için olmak üzere hedef aralıkları bireyseldir ve bir uzmanla belirlenir. Tahlildeki yönelim sayıları kişisel bir değerlendirmeyi yerini tutmaz."
    },
    personalized: true,
    relevantLabKey: "allLabs"
  },
  {
    id: 10,
    icon: "🔍",
    title: {
      de: "Tricks der Lebensmittelindustrie",
      en: "Food Industry Tricks",
      es: "Trucos de la industria alimentaria",
      it: "Trucchi dell'industria alimentare"
    ,
      pt: "Truques da indústria alimentar",
      fr: "Astuces de l'industrie agroalimentaire",
      tr: "Gıda Endüstrisinin Hileleri"
    },
    summary: {
      de: "Durchschaue die Verpackung – von der Portionsgrößen-Falle über Zucker-Synonyme bis zu 'Light' und 'Bio'-Etiketten.",
      en: "See through the packaging – from the portion-size trap to sugar synonyms to 'light' and 'organic' labels.",
      es: "Aprende a ver a través del envase – desde la trampa del tamaño de la ración hasta los sinónimos del azúcar y las etiquetas 'light' o 'bio'.",
      it: "Impara a guardare oltre la confezione – dalla trappola delle porzioni ai sinonimi dello zucchero fino alle etichette 'light' e 'bio'."
    ,
      pt: "Vê através da embalagem – desde a armadilha do tamanho da porção até aos sinónimos de açúcar e aos rótulos 'light' e 'bio'.",
      fr: "Vois clair dans les emballages – du piège des portions aux synonymes du sucre en passant par les étiquettes 'light' et 'bio'.",
      tr: "Ambalajın arkasını gör – porsiyon boyutu tuzağından şeker eş anlamlılarına, 'light' ve 'bio' etiketlerine kadar."
    },
    mainContent: {
      de: "Die Lebensmittelindustrie nutzt clevere Tricks, um Produkte gesünder aussehen zu lassen als sie sind. Trick 1: Die Portionsgrößen-Falle – eine kleine Portion wird angegeben, aber du isst die große. Trick 2: Zucker-Synonyme – Glukosesirup, Fruktosesirup, Maissirup, Agavendicksaft – das ist alles Zucker. Trick 3: 'Ohne zugesetzten Zucker' – das Produkt kann von Natur aus sehr viel Zucker enthalten. Trick 4: 'Light' oder 'Zero' – oft wurde Fett reduziert und dafür Zucker oder Salz erhöht. Trick 5: 'Natürlich' und 'Bio' – gut für die Umwelt, aber nicht automatisch gut für deine Werte. Trick 6: Die 100-Gramm-Angabe – werblich, aber die Packung ist oft größer.",
      en: "The food industry uses clever tricks to make products look healthier than they are. Trick 1: the portion-size trap – a small serving is listed, but you eat the whole large one. Trick 2: sugar synonyms – glucose syrup, fructose syrup, corn syrup, agave syrup – it's all sugar. Trick 3: 'no added sugar' – the product can naturally contain a lot of sugar anyway. Trick 4: 'light' or 'zero' – fat was often reduced and sugar or salt increased instead. Trick 5: 'natural' and 'organic' – good for the environment, but not automatically good for your values. Trick 6: the per-100-gram figure – marketing, but the package is often larger.",
      es: "La industria alimentaria usa trucos ingeniosos para que los productos parezcan más sanos de lo que son. Truco 1: la trampa del tamaño de la ración – se indica una ración pequeña, pero tú te comes la grande. Truco 2: sinónimos del azúcar – jarabe de glucosa, jarabe de fructosa, jarabe de maíz, sirope de agave – todo es azúcar. Truco 3: 'sin azúcares añadidos' – el producto puede contener naturalmente mucho azúcar de todos modos. Truco 4: 'light' o 'zero' – a menudo se redujo la grasa y se aumentó el azúcar o la sal en su lugar. Truco 5: 'natural' y 'bio' – bueno para el medio ambiente, pero no automáticamente bueno para tus valores. Truco 6: la cifra por 100 gramos – publicitaria, pero el envase suele ser más grande.",
      it: "L'industria alimentare usa trucchi intelligenti per far sembrare i prodotti più sani di quanto siano. Trucco 1: la trappola delle porzioni – viene indicata una porzione piccola, ma tu mangi quella grande. Trucco 2: sinonimi dello zucchero – sciroppo di glucosio, sciroppo di fruttosio, sciroppo di mais, sciroppo d'agave – è tutto zucchero. Trucco 3: 'senza zuccheri aggiunti' – il prodotto può comunque contenere naturalmente molto zucchero. Trucco 4: 'light' o 'zero' – spesso è stato ridotto il grasso e aumentati zucchero o sale al suo posto. Trucco 5: 'naturale' e 'bio' – buono per l'ambiente, ma non automaticamente buono per i tuoi valori. Trucco 6: il valore per 100 grammi – pubblicitario, ma la confezione è spesso più grande."
    ,
      pt: "A indústria alimentar utiliza truques inteligentes para fazer os produtos parecerem mais saudáveis do que realmente são. Truque 1: a armadilha do tamanho da porção – é indicada uma porção pequena, mas tu comes a grande. Truque 2: sinónimos de açúcar – xarope de glicose, xarope de frutose, xarope de milho, néctar de agave – tudo isto é açúcar. Truque 3: 'sem adição de açúcar' – o produto pode conter naturalmente muito açúcar de qualquer forma. Truque 4: 'light' ou 'zero' – muitas vezes reduziu-se a gordura e aumentou-se o açúcar ou o sal. Truque 5: 'natural' e 'bio' – bom para o ambiente, mas não automaticamente bom para os teus valores. Truque 6: a indicação por 100 gramas – publicitária, mas a embalagem é muitas vezes maior.",
      fr: "L'industrie agroalimentaire utilise des astuces ingénieuses pour faire paraître ses produits plus sains qu'ils ne le sont. Astuce 1 : le piège des portions – une petite portion est indiquée, mais tu manges la grande. Astuce 2 : les synonymes du sucre – sirop de glucose, sirop de fructose, sirop de maïs, sirop d'agave – tout cela, c'est du sucre. Astuce 3 : 'sans sucres ajoutés' – le produit peut malgré tout contenir naturellement beaucoup de sucre. Astuce 4 : 'light' ou 'zero' – souvent, la matière grasse a été réduite et le sucre ou le sel augmenté à la place. Astuce 5 : 'naturel' et 'bio' – bon pour l'environnement, mais pas automatiquement bon pour tes valeurs. Astuce 6 : l'indication pour 100 grammes – à visée publicitaire, alors que l'emballage est souvent plus grand.",
      tr: "Gıda endüstrisi, ürünleri olduklarından daha sağlıklı göstermek için akıllı hileler kullanır. Hile 1: porsiyon boyutu tuzağı – küçük bir porsiyon belirtilir, ama sen büyük porsiyonu yersin. Hile 2: şeker eş anlamlıları – glikoz şurubu, fruktoz şurubu, mısır şurubu, agave şurubu – bunların hepsi şekerdir. Hile 3: 'şeker ilavesiz' – ürün doğal olarak zaten çok fazla şeker içerebilir. Hile 4: 'light' veya 'zero' – genellikle yağ azaltılmış, bunun yerine şeker veya tuz artırılmıştır. Hile 5: 'doğal' ve 'organik' – çevre için iyi, ama değerlerin için otomatik olarak iyi değil. Hile 6: 100 gram başına verilen değer – reklam amaçlıdır, ama paket genellikle daha büyüktür."
    },
    deepDive: {
      de: "Die Reihenfolge der Zutaten auf der Verpackung ist gesetzlich vorgeschrieben – die Zutat mit dem größten Gewichtsanteil steht zuerst. Das ist eine der verlässlichsten Angaben, um die Zusammensetzung eines Produkts einzuschätzen.",
      en: "The order of ingredients on the label is legally required – the ingredient with the largest weight share is listed first. This is one of the most reliable ways to judge a product's composition.",
      es: "El orden de los ingredientes en el envase es obligatorio por ley – el ingrediente con mayor peso aparece primero. Es uno de los datos más fiables para valorar la composición de un producto.",
      it: "L'ordine degli ingredienti sulla confezione è previsto per legge – l'ingrediente con la maggiore quota in peso è elencato per primo. È uno dei dati più affidabili per valutare la composizione di un prodotto."
    ,
      pt: "A ordem dos ingredientes na embalagem é legalmente obrigatória – o ingrediente com maior percentagem de peso aparece primeiro. Esta é uma das indicações mais fiáveis para avaliar a composição de um produto.",
      fr: "L'ordre des ingrédients sur l'emballage est imposé par la loi – l'ingrédient dont le poids est le plus important est indiqué en premier. C'est l'une des indications les plus fiables pour évaluer la composition d'un produit.",
      tr: "Ambalajdaki malzeme sıralaması yasal olarak zorunludur – ağırlık oranı en yüksek olan malzeme ilk sırada yer alır. Bu, bir ürünün bileşimini değerlendirmek için en güvenilir bilgilerden biridir."
    },
    personalized: false
  },
  {
    id: 11,
    icon: "🧠",
    title: {
      de: "Mythen & Missverständnisse",
      en: "Myths & Misconceptions",
      es: "Mitos y malentendidos",
      it: "Miti e fraintendimenti"
    ,
      pt: "Mitos e mal-entendidos",
      fr: "Mythes et idées reçues",
      tr: "Mitler ve Yanlış Anlamalar"
    },
    summary: {
      de: "Räumt auf mit den hartnäckigsten Irrtümern – von 'Fett macht fett' über 'Obst ist ungesund' bis zu 'Cholesterin im Essen ist schlecht'.",
      en: "Clears up the most stubborn myths – from 'fat makes you fat' to 'fruit is unhealthy' to 'dietary cholesterol is bad'.",
      es: "Desmonta los mitos más persistentes – desde 'la grasa engorda' hasta 'la fruta es poco saludable' o 'el colesterol de los alimentos es malo'.",
      it: "Sfata i miti più radicati – da 'i grassi fanno ingrassare' a 'la frutta fa male' fino a 'il colesterolo nel cibo è dannoso'."
    ,
      pt: "Desfaz os mitos mais persistentes – de 'a gordura engorda' a 'a fruta não é saudável' e 'o colesterol na comida é mau'.",
      fr: "Démêle le vrai du faux sur les idées reçues les plus tenaces – de 'les graisses font grossir' à 'les fruits ne sont pas sains' en passant par 'le cholestérol alimentaire est mauvais'.",
      tr: "'Yağ şişmanlatır'dan 'meyve sağlıksızdır'a, 'yiyeceklerdeki kolesterol kötüdür'e kadar en inatçı yanlış inanışları çürütür."
    },
    mainContent: {
      de: "Im Internet kursieren unzählige Ernährungsmythen. Mythos 1: 'Fett macht fett' – falsch, es ist die Kombination von Kohlenhydraten und Fett. Mythos 2: 'Obst ist ungesund' – teils falsch, ganzes Obst enthält Ballaststoffe, Fruchtsäfte sind das Problem. Mythos 3: 'Kohlenhydrate sind bei erhöhtem Blutzucker tabu' – falsch, es kommt auf die Art und Menge an. Mythos 4: 'Cholesterin im Essen erhöht dein Cholesterin' – falsch, gesättigte Fette sind der größere Treiber. Mythos 5: 'Abnehmen senkt automatisch Triglyceride' – nicht unbedingt, die Zusammensetzung der Ernährung ist entscheidend. Mythos 6: 'Kohlenhydrate am Abend machen dick' – die Tageszeit ist unwichtig, die Gesamtbilanz zählt.",
      en: "Countless nutrition myths circulate online. Myth 1: 'Fat makes you fat' – wrong, it's the combination of carbohydrates and fat. Myth 2: 'Fruit is unhealthy' – partly wrong, whole fruit contains fiber, fruit juices are the problem. Myth 3: 'Carbohydrates are off-limits when blood sugar is elevated' – wrong, it depends on the type and amount. Myth 4: 'Cholesterol in food raises your cholesterol' – wrong, saturated fats are the bigger driver. Myth 5: 'Losing weight automatically lowers triglycerides' – not necessarily, the composition of your diet is decisive. Myth 6: 'Carbs in the evening make you fat' – time of day doesn't matter, total balance counts.",
      es: "En internet circulan innumerables mitos sobre nutrición. Mito 1: 'La grasa engorda' – falso, es la combinación de carbohidratos y grasa. Mito 2: 'La fruta es poco saludable' – parcialmente falso, la fruta entera contiene fibra, el problema son los zumos. Mito 3: 'Los carbohidratos están prohibidos si la glucosa está alta' – falso, depende del tipo y la cantidad. Mito 4: 'El colesterol de los alimentos aumenta tu colesterol' – falso, las grasas saturadas son el factor más importante. Mito 5: 'Adelgazar reduce automáticamente los triglicéridos' – no necesariamente, la composición de la dieta es decisiva. Mito 6: 'Los carbohidratos por la noche engordan' – la hora del día no importa, cuenta el balance total.",
      it: "In rete circolano innumerevoli miti sull'alimentazione. Mito 1: 'I grassi fanno ingrassare' – falso, è la combinazione di carboidrati e grassi. Mito 2: 'La frutta fa male' – in parte falso, la frutta intera contiene fibre, il problema sono i succhi di frutta. Mito 3: 'I carboidrati sono tabù se la glicemia è elevata' – falso, dipende dal tipo e dalla quantità. Mito 4: 'Il colesterolo negli alimenti aumenta il tuo colesterolo' – falso, i grassi saturi sono il fattore più determinante. Mito 5: 'Dimagrire abbassa automaticamente i trigliceridi' – non necessariamente, la composizione della dieta è decisiva. Mito 6: 'I carboidrati la sera fanno ingrassare' – l'orario non conta, conta il bilancio totale."
    ,
      pt: "Circulam na internet inúmeros mitos nutricionais. Mito 1: 'A gordura engorda' – falso, é a combinação de hidratos de carbono e gordura. Mito 2: 'A fruta não é saudável' – parcialmente falso, a fruta inteira contém fibra, os sumos de fruta é que são o problema. Mito 3: 'Hidratos de carbono são tabu com glicemia elevada' – falso, depende do tipo e da quantidade. Mito 4: 'O colesterol na comida aumenta o teu colesterol' – falso, as gorduras saturadas são o fator mais determinante. Mito 5: 'Emagrecer reduz automaticamente os triglicéridos' – não necessariamente, a composição da alimentação é decisiva. Mito 6: 'Hidratos de carbono à noite engordam' – a hora do dia não é relevante, conta o balanço total.",
      fr: "D'innombrables mythes nutritionnels circulent sur internet. Mythe 1 : 'Les graisses font grossir' – faux, c'est la combinaison des glucides et des graisses qui pose problème. Mythe 2 : 'Les fruits ne sont pas sains' – en partie faux, le fruit entier contient des fibres, ce sont les jus de fruits qui posent problème. Mythe 3 : 'Les glucides sont tabous quand la glycémie est élevée' – faux, cela dépend du type et de la quantité. Mythe 4 : 'Le cholestérol alimentaire augmente ton cholestérol' – faux, les graisses saturées en sont le principal moteur. Mythe 5 : 'Perdre du poids réduit automatiquement les triglycérides' – pas nécessairement, la composition de l'alimentation est déterminante. Mythe 6 : 'Les glucides le soir font grossir' – l'heure de la journée n'a pas d'importance, c'est le bilan total qui compte.",
      tr: "İnternette sayısız beslenme miti dolaşıyor. Mit 1: 'Yağ şişmanlatır' – yanlış, sorun karbonhidrat ve yağın birleşimidir. Mit 2: 'Meyve sağlıksızdır' – kısmen yanlış, tam meyve lif içerir, sorun meyve sularıdır. Mit 3: 'Kan şekeri yüksekken karbonhidrat yasaktır' – yanlış, bu türe ve miktara bağlıdır. Mit 4: 'Yiyeceklerdeki kolesterol kolesterolünü artırır' – yanlış, doymuş yağlar çok daha büyük bir etkendir. Mit 5: 'Kilo vermek otomatik olarak trigliseritleri düşürür' – mutlaka değil, beslenmenin bileşimi belirleyicidir. Mit 6: 'Akşam yenen karbonhidratlar şişmanlatır' – günün saati önemli değildir, toplam denge önemlidir."
    },
    deepDive: {
      de: "Die Leber produziert etwa 80 Prozent des körpereigenen Cholesterins – nur 20 Prozent stammen aus der Nahrung. Das ist der Grund, warum Cholesterin aus Eiern oder Shrimps nur einen geringen Einfluss auf den LDL-Wert hat.",
      en: "The liver produces about 80 percent of the body's own cholesterol – only 20 percent comes from food. That's why cholesterol from eggs or shrimp has only a small effect on LDL levels.",
      es: "El hígado produce alrededor del 80 % del colesterol del propio cuerpo – solo el 20 % procede de la alimentación. Por eso el colesterol de los huevos o las gambas tiene solo un efecto reducido sobre el LDL.",
      it: "Il fegato produce circa l'80% del colesterolo del corpo – solo il 20% proviene dall'alimentazione. Per questo il colesterolo di uova o gamberetti ha solo un effetto ridotto sul livello di LDL."
    ,
      pt: "O fígado produz cerca de 80% do colesterol do próprio corpo – apenas 20% provêm da alimentação. É por isso que o colesterol dos ovos ou dos camarões tem apenas um pequeno impacto no valor de LDL.",
      fr: "Le foie produit environ 80 % du cholestérol de l'organisme – seuls 20 % proviennent de l'alimentation. C'est pourquoi le cholestérol des œufs ou des crevettes n'a qu'un effet limité sur le taux de LDL.",
      tr: "Karaciğer, vücudun kendi kolesterolünün yaklaşık %80'ini üretir – sadece %20'si beslenmeden gelir. Bu nedenle yumurta veya karidesteki kolesterolün LDL değeri üzerinde yalnızca küçük bir etkisi vardır."
    },
    personalized: false
  }
];
