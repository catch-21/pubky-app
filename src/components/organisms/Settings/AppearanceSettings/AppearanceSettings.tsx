'use client';

import { Container } from '@/atoms/Container/Container';
import { Heading } from '@/atoms/Heading/Heading';
import { RadioGroup, RadioGroupItem } from '@/atoms/RadioGroup/RadioGroup';
import { Typography } from '@/atoms/Typography/Typography';
import type { ThemeOption } from '@/config/theme';
import { useThemePreference } from '@/hooks/useThemePreference/useThemePreference';
import { THEME_CHOICES } from './AppearanceSettings.constants';

export function AppearanceSettings() {
  const { theme, isReady, setTheme } = useThemePreference();

  return (
    <Container overrideDefaults className="flex w-full flex-col items-start justify-start gap-3">
      <Heading level={4} size="md" className="text-xl leading-7">
        Interface
      </Heading>
      <Typography
        as="p"
        size="md"
        overrideDefaults
        className="text-base leading-6 font-medium text-secondary-foreground"
      >
        Choose how Pubky looks to you.
      </Typography>
      <RadioGroup
        aria-label="Interface theme"
        value={theme}
        disabled={!isReady}
        onValueChange={(value) => setTheme(value as ThemeOption)}
        className="w-full gap-3 pt-3 md:auto-cols-fr md:grid-flow-col"
      >
        {THEME_CHOICES.map((choice) => (
          <RadioGroupItem
            key={choice.value}
            id={`appearance-theme-${choice.value}`}
            value={choice.value}
            label={choice.label}
            description={choice.description}
            variant="box"
          />
        ))}
      </RadioGroup>
    </Container>
  );
}
