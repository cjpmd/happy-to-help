import { createFileRoute } from '@tanstack/react-router';
import { DocumentsPage } from '@/components/dawn/WorkspacePages';
import { pageHead } from '@/lib/seo';
export const Route = createFileRoute('/_app/documents')({head:()=>pageHead('Documents','Versioned company knowledge and roadmaps.'),component:DocumentsPage});
