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
  ],
});

export default router;
