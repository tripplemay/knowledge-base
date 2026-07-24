import { MdOutlineLibraryBooks } from 'react-icons/md';

// 知识库导航（动态文档页不在侧栏注册）

const routes = [
  {
    name: '知识库',
    path: '/kb',
    icon: <MdOutlineLibraryBooks className="text-inherit h-5 w-5" />,
    collapse: true,
    items: [
      {
        name: '知识域总览',
        layout: '/admin',
        path: '/kb/domains',
      },
      {
        name: '全文搜索',
        layout: '/admin',
        path: '/kb/search',
      },
      {
        name: '上传文档',
        layout: '/admin',
        path: '/kb/upload',
      },
      {
        name: '任务中心',
        layout: '/admin',
        path: '/kb/jobs',
      },
    ],
  },
];
export default routes;
