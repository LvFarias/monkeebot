import { describe, expect, it } from 'vitest';
import { extractDiscordId, extractDiscordIds, isValidHttpUrl } from '../../../services/discord.js';

describe('services/discord', () => {
    describe('extractDiscordId', () => {
        it('returns null when the input is empty', () => {
            expect(extractDiscordId()).toBeNull();
            expect(extractDiscordId('')).toBeNull();
        });

        it('returns the first 17-20 digit sequence', () => {
            const mention = '<@123456789012345678>';
            expect(extractDiscordId(mention)).toBe('123456789012345678');
        });

        it('ignores shorter numbers', () => {
            const text = 'id: 42 and 9876543210987654321 in here';
            expect(extractDiscordId(text)).toBe('9876543210987654321');
        });
    });

    describe('extractDiscordIds', () => {
        it('returns an empty array when no ids are present', () => {
            expect(extractDiscordIds()).toEqual([]);
            expect(extractDiscordIds('just text')).toEqual([]);
        });

        it('collects unique ids in order of appearance', () => {
            const text = '<@123456789012345678> and <@!123456789012345678> plus 999999999999999999';
            expect(extractDiscordIds(text)).toEqual(['123456789012345678', '999999999999999999']);
        });
    });

    describe('isValidHttpUrl', () => {
        it('accepts http and https urls', () => {
            expect(isValidHttpUrl('http://example.com')).toBe(true);
            expect(isValidHttpUrl('https://example.com/path')).toBe(true);
        });

        it('rejects other protocols and invalid input', () => {
            expect(isValidHttpUrl('ftp://example.com')).toBe(false);
            expect(isValidHttpUrl('notaurl')).toBe(false);
            expect(isValidHttpUrl('')).toBe(false);
        });
    });
});
