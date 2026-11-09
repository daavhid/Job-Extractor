import { BaseExtractor } from "./base";
import { LinkedInExtractor } from "./linkedin";
import { JobRightExtractor } from "./jobright";
import { HiringCafeExtractor } from "./hiringcafe";
import { ZipRecruiterExtractor } from "./ziprecruiter";
import { GenericExtractor } from "./generic";

const extractors: BaseExtractor[] = [
  new LinkedInExtractor(),
  new JobRightExtractor(),
  new HiringCafeExtractor(),
  new ZipRecruiterExtractor(),
];

const genericExtractor = new GenericExtractor();

export function getExtractorForUrl(url: string): BaseExtractor {
  for (const extractor of extractors) {
    if (extractor.match(url)) {
      return extractor;
    }
  }
  return genericExtractor;
}
