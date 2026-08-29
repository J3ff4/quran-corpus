import Constants from 'expo-constants';
import { ScrollView, Text, View } from 'react-native';
import { RECITERS } from '@quran-corpus/data/mobile';

import { GlassSurface } from '@/components/GlassSurface';
import type { UiLocaleCode } from '@/i18n/languages';
import { t, type UiStringKey } from '@/i18n/uiStrings';
import { radii, typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';
import { useListBottomPadding } from '@/theme/useListBottomPadding';
import { useAppSettings } from '@/settings/settingsStore';

interface Credit {
  /** A proper noun, so it is not a translation key. */
  name: string;
  body: UiStringKey;
  /** True where nobody has cleared the licence yet. §11 says validate before
   *  shipping; a credits screen that states a term we guessed at is worse than
   *  one that admits the check is outstanding. */
  pending?: boolean;
}

const GROUPS: { title: UiStringKey; credits: Credit[] }[] = [
  {
    title: 'about.groupText',
    credits: [
      { name: 'Tanzil', body: 'about.sourceArabic', pending: true },
      { name: 'corpus.quran.com', body: 'about.sourceCorpus' },
      { name: 'Saheeh International', body: 'about.sourceEnglish', pending: true },
      { name: 'Muhammad Sodik Muhammad Yusuf', body: 'about.sourceUzbek', pending: true },
      { name: 'Abu Adel', body: 'about.sourceRussian', pending: true },
    ],
  },
  {
    title: 'about.groupDictionary',
    credits: [
      { name: "Lane's Lexicon", body: 'about.sourceLane' },
      { name: 'Hans Wehr', body: 'about.sourceHansWehr', pending: true },
      { name: 'Quran Corpus', body: 'about.sourceEditorial' },
    ],
  },
];

const TYPEFACES: Credit[] = [
  { name: 'Newsreader', body: 'about.sourceNewsreader' },
  { name: 'Hafs', body: 'about.sourceHafs', pending: true },
];

export function AboutScreen() {
  const { uiLocale } = useAppSettings();
  const theme = useThemeColors();
  const paddingBottom = useListBottomPadding();

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingBottom, paddingHorizontal: 16, paddingTop: 12, gap: 4 }}
    >
      <Text
        accessibilityRole="header"
        style={{ color: theme.text, fontSize: typography.title, fontWeight: '700' }}
      >
        {t(uiLocale, 'about.title')}
      </Text>
      {/* Same line the Menu screen carries, from the same config: this is what
          gets quoted back in a bug report. */}
      <Text testID="app-version" style={{ color: theme.mutedText, fontSize: typography.caption }}>
        {`Quran Corpus ${Constants.expoConfig?.version ?? '—'}`}
      </Text>

      {GROUPS.map((group) => (
        <CreditGroup key={group.title} title={t(uiLocale, group.title)} uiLocale={uiLocale}>
          {group.credits.map((credit, index) => (
            <CreditRow
              key={credit.name}
              credit={credit}
              uiLocale={uiLocale}
              last={index === group.credits.length - 1}
            />
          ))}
        </CreditGroup>
      ))}

      <CreditGroup title={t(uiLocale, 'about.groupRecitation')} uiLocale={uiLocale}>
        <CreditRow
          credit={{ name: 'everyayah.com', body: 'about.sourceAudio', pending: true }}
          uiLocale={uiLocale}
          last
        >
          {/* Rendered from RECITERS, never retyped. Adding a reciter to the
              shared table would otherwise leave this screen quietly wrong,
              which is a licence problem rather than a copy one (§11). */}
          <View testID="reciter-credits" style={{ marginTop: 8, gap: 4 }}>
            {RECITERS.map((reciter) => (
              <Text
                key={reciter.id}
                style={{ color: theme.mutedText, fontSize: typography.caption }}
              >
                {reciter.label}
              </Text>
            ))}
          </View>
        </CreditRow>
      </CreditGroup>

      <CreditGroup title={t(uiLocale, 'about.groupTypefaces')} uiLocale={uiLocale}>
        {TYPEFACES.map((credit, index) => (
          <CreditRow
            key={credit.name}
            credit={credit}
            uiLocale={uiLocale}
            last={index === TYPEFACES.length - 1}
          />
        ))}
      </CreditGroup>
    </ScrollView>
  );
}

function CreditGroup({
  title,
  children,
}: {
  title: string;
  uiLocale: UiLocaleCode;
  children: React.ReactNode;
}) {
  const theme = useThemeColors();
  return (
    <View style={{ gap: 7, marginTop: 10 }}>
      <Text
        accessibilityRole="header"
        style={{ color: theme.mutedText, fontSize: typography.caption, marginLeft: 4 }}
      >
        {title}
      </Text>
      <GlassSurface style={{ paddingHorizontal: 15 }}>{children}</GlassSurface>
    </View>
  );
}

function CreditRow({
  credit,
  uiLocale,
  last,
  children,
}: {
  credit: Credit;
  uiLocale: UiLocaleCode;
  last?: boolean;
  children?: React.ReactNode;
}) {
  const theme = useThemeColors();
  return (
    <View
      style={{
        paddingVertical: 12,
        gap: 4,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: last ? 'transparent' : theme.border,
      }}
    >
      <Text style={{ color: theme.text, fontSize: typography.body, fontWeight: '600' }}>
        {credit.name}
      </Text>
      <Text style={{ color: theme.mutedText, fontSize: typography.caption, lineHeight: 19 }}>
        {t(uiLocale, credit.body)}
      </Text>
      {children}
      {credit.pending ? (
        // A pill rather than a sentence appended to every body: it is the same
        // fact each time, and as running text it read as part of the credit.
        <Text
          testID={`pending-${credit.name}`}
          style={{
            alignSelf: 'flex-start',
            marginTop: 4,
            paddingHorizontal: 8,
            paddingVertical: 3,
            borderRadius: radii.chip,
            borderWidth: 1,
            borderColor: theme.border,
            color: theme.mutedText,
            fontSize: typography.caption,
          }}
        >
          {t(uiLocale, 'about.sourceApprovalIncomplete')}
        </Text>
      ) : null}
    </View>
  );
}
