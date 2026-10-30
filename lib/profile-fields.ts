export const PROFILE_LIMITS = {phone:40,addressLine1:160,addressLine2:160,city:80,region:80,postalCode:24,country:80,organization:100,jobTitle:100,website:240,bio:500} as const;
export type ProfileFields = {[K in keyof typeof PROFILE_LIMITS]:string};
export type PrivateProfile = ProfileFields & {updatedAt:string;photoVersion:string|null};
export const EMPTY_PROFILE:ProfileFields={phone:"",addressLine1:"",addressLine2:"",city:"",region:"",postalCode:"",country:"",organization:"",jobTitle:"",website:"",bio:""};
