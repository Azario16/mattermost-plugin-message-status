const STRINGS = {
    en: {
        delivered: 'Delivered',
        read: 'Read',
        readBy: 'Read by {name}',
    },
    ru: {
        delivered: 'Доставлено',
        read: 'Прочитано',
        readBy: 'Прочитано: {name}',
    },
} as const;

function pickLocale(locale: string): keyof typeof STRINGS {
    return locale.toLowerCase().startsWith('ru') ? 'ru' : 'en';
}

export function getTranslationsForLocale(locale: string): Record<string, string> {
    const selected = STRINGS[pickLocale(locale)];

    return {
        'plugin.message_status.delivered': selected.delivered,
        'plugin.message_status.read': selected.read,
        'plugin.message_status.read_by': selected.readBy,
    };
}

export function formatReadByLabel(template: string, name: string): string {
    return template.replace('{name}', name);
}
