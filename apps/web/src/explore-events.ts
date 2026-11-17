export const EXPLORE_CHANGED_EVENT = 'dn-explore-changed';
export interface ExploreChangeDetail {
  vote?:{ownerUsername:string;slug:string;stars:number;viewerHasStarred:boolean};
}
