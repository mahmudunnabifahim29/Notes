import type {Metadata} from 'next';
import Workspace from './workspace';

// Only the public homepage is searchable. Account and shared-note routes inherit
// the root layout's noindex policy and retain their existing authorization.
export const metadata:Metadata={
 title:'NoteAtlas — Your ideas, organized',
 description:'A private home for your notes. Capture ideas, organize them with folders and tags, attach files, and share read-only links when you choose.',
 robots:{index:true,follow:true},
 alternates:{canonical:"https://app.noteatlas.workers.dev/"},
};
export default function Home(){return <Workspace/>;}
