const messages:Record<string,string>={
 ACCESS_REQUIRED:'articles require publisher sign-in or access.',
 PUBLISHER_BLOCK:'articles were blocked by the publisher.',
 PAID_OUTCOME_UNKNOWN:'articles are waiting for confirmation of an earlier paid request; retries are paused.',
 IDENTITY_MISMATCH:'articles returned a different URL or article identity and were rejected.',
 NO_READABLE_TEXT:'articles did not provide readable article text.',
 LISTING_PAGE:'pages were indexes or section listings, not individual articles.',
 TEMPORARY_FETCH_FAILURE:'articles could not be fetched after bounded retries.',
 ACCESS_RESTRICTED:'articles could not be fetched under the current access policy.',
 OTHER:'article acquisition jobs failed.'
};
export const sourceAcquisitionMessage=(reason:string,count?:number)=>{const message=messages[reason]??messages.OTHER;return count===1?message.replace(/^articles require /,'article requires ').replace(/^articles were /,'article was ').replace(/^articles are /,'article is ').replace(/^articles /,'article ').replace(/^pages were indexes or section listings, not individual articles\./,'page was an index or section listing, not an individual article.').replace(/ and were rejected\./,' and was rejected.').replace(/^article acquisition jobs /,'article acquisition job '):message;};
