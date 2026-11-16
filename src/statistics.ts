export interface ArticleStatistics { characters: number; wechatWords: number }

/** A reference count calibrated against the user's WeChat editor sample.
 * Keep whitespace until grouping so that separate English words remain separate.
 * This is an estimate, not a guarantee of the platform's rules for every symbol.
 */
export function countArticleText(text: string): ArticleStatistics {
  return {
    characters: text.replace(/\s/g, '').length,
    wechatWords: text.replace(/[A-Za-z]+|[0-9]+/g, 'x').replace(/\s/g, '').length
  };
}
