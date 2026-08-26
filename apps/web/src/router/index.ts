import { createRouter, createWebHistory } from "vue-router";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", redirect: "/containers" },
    {
      path: "/containers",
      name: "containers",
      component: () => import("@/views/ContainersView.vue"),
    },
    {
      path: "/containers/:id/logs",
      name: "container-logs",
      component: () => import("@/views/ContainerLogsView.vue"),
    },
    {
      path: "/containers/logs",
      name: "containers-group-logs",
      component: () => import("@/views/GroupLogsView.vue"),
    },
    {
      path: "/images",
      name: "images",
      component: () => import("@/views/ImagesView.vue"),
    },
    {
      path: "/volumes",
      name: "volumes",
      component: () => import("@/views/VolumesView.vue"),
    },
    {
      path: "/stacks",
      name: "stacks",
      component: () => import("@/views/StacksView.vue"),
    },
    {
      path: "/stacks/:project",
      name: "stack-detail",
      component: () => import("@/views/StackDetailView.vue"),
    },
    {
      path: "/settings",
      name: "settings",
      component: () => import("@/views/SettingsView.vue"),
    },
  ],
});

export default router;
