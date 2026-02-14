import { PhraseSplitter } from '../expander/PhraseSplitter';
import { isValidDomainName, isPronounceab } from '../recombiner/rules';
import { DomainScorer } from '../scorer/DomainScorer';

describe('Engine Core Tests', () => {
  describe('Token Filtering', () => {
    it('should filter stopwords', () => {
      const splitter = new PhraseSplitter(['the', 'and']);
      const tokens = splitter.split('the cloud and sync');
      expect(tokens).toEqual(['cloud', 'sync']);
    });

    it('should normalize tokens', () => {
      const splitter = new PhraseSplitter();
      const token = splitter.normalize('  CLOUD  ');
      expect(token).toBe('cloud');
    });
  });

  describe('Recombination Rules', () => {
    it('should validate domain names', () => {
      expect(isValidDomainName('cloudsync')).toBe(true);
      expect(isValidDomainName('-cloud')).toBe(false);
      expect(isValidDomainName('cloud-')).toBe(false);
      expect(isValidDomainName('ab')).toBe(false);
    });

    it('should check pronounceability', () => {
      expect(isPronounceab('cloudsync')).toBe(true);
      expect(isPronounceab('bcdfgh')).toBe(false);
    });
  });

  describe('Score Thresholds', () => {
    const scorer = new DomainScorer();

    it('should score domains between 0-100', () => {
      const result = scorer.score('cloudsync');
      expect(result.total).toBeGreaterThanOrEqual(0);
      expect(result.total).toBeLessThanOrEqual(100);
    });

    it('should include all metric scores', () => {
      const result = scorer.score('hub');
      expect(result.pronounceability).toBeGreaterThan(0);
      expect(result.brandability).toBeGreaterThan(0);
      expect(result.technicalQuality).toBeGreaterThan(0);
    });
  });
});
