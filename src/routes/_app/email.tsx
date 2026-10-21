import { createFileRoute } from '@tanstack/react-router';
import { EmailPage } from '@/components/dawn/WorkspacePages';
import { pageHead } from '@/lib/seo';
export const Route = createFileRoute('/_app/email')({head:()=>pageHead('Email','Company support and reviewed outreach batches.'),component:EmailPage});
