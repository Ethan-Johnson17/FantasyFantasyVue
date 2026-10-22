import { asteriskCensorStrategy, englishDataset, englishRecommendedTransformers, RegExpMatcher, TextCensor } from 'obscenity'

/*
 * The chat profanity filter: masks strong profanity and slurs with asterisks, including common
 * look-alike spellings ("sh1t"), without catching innocent words that contain them ("Scunthorpe",
 * "assassin"). Mild words such as "damn" and "hell" pass. Uses the obscenity library's English list,
 * offline, so nothing a member writes is sent anywhere else.
 */

const matcher = new RegExpMatcher({ ...englishDataset.build(), ...englishRecommendedTransformers })
const censor = new TextCensor().setStrategy(asteriskCensorStrategy())

export function filterProfanity(text: string): string {
  return censor.applyTo(text, matcher.getAllMatches(text))
}
