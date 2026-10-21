import { createFileRoute } from '@tanstack/react-router';
import { TeamPage } from '@/components/dawn/WorkspacePages';
import { pageHead } from '@/lib/seo';
export const Route = createFileRoute('/_app/team')({head:()=>pageHead('Team','Invite company teammates, mentors and viewers.'),component:TeamPage});
