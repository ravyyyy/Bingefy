// src/components/TabsLayout.tsx
import React from "react";
import { NavLink, Outlet } from "react-router-dom";

export function TabsLayout() {
  return (
    <div style={styles.outerContainer}>
      {/* 1) Main menu: now pinned to bottom */}
      <nav style={styles.tabBar}>
        <NavLink
          to="shows"
          style={({ isActive }) => (isActive ? styles.activeTab : styles.tab)}
        >
          <span style={styles.icon}>📺</span>
          <span style={styles.label}>Shows</span>
        </NavLink>

        <NavLink
          to="movies"
          style={({ isActive }) => (isActive ? styles.activeTab : styles.tab)}
        >
          <span style={styles.icon}>🎬</span>
          <span style={styles.label}>Movies</span>
        </NavLink>

        <NavLink
          to="explore"
          style={({ isActive }) => (isActive ? styles.activeTab : styles.tab)}
        >
          <span style={styles.icon}>🔍</span>
          <span style={styles.label}>Explore</span>
        </NavLink>

        <NavLink
          to="profile"
          style={({ isActive }) => (isActive ? styles.activeTab : styles.tab)}
        >
          <span style={styles.icon}>👤</span>
          <span style={styles.label}>Profile</span>
        </NavLink>
      </nav>

      {/* 2) Content area: scrollable, with bottom padding to avoid being hidden */}
      <div style={styles.contentContainer}>
        <Outlet />
      </div>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  outerContainer: {
    display: "flex",
    flexDirection: "column",
    minHeight: "100vh", // ensure the container fills full viewport
    backgroundColor: "#000",
  },
  tabBar: {
    position: "fixed",
    bottom: 0,
    left: 0,
    width: "100%",
    display: "flex",
    justifyContent: "space-around",
    alignItems: "center",
    height: "64px",           // same height as before
    backgroundColor: "#111",
    borderTop: "1px solid #333", // separator above the bar
    zIndex: 10,
  },
  tab: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    color: "#888",
    textDecoration: "none",
    fontSize: "14px",
    gap: "4px",
    width: "25%",
    height: "100%",
    transition: "color 0.2s",
  },
  activeTab: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    color: "#fff",
    textDecoration: "none",
    fontSize: "14px",
    gap: "4px",
    width: "25%",
    height: "100%",
    borderBottom: "3px solid #e50914",
    transition: "color 0.2s, border-bottom 0.2s",
  },
  icon: {
    fontSize: "28px",
    lineHeight: 1,
  },
  label: {
    fontSize: "14px",
    fontWeight: 500,
  },
  contentContainer: {
    flex: 1,
    overflow: "hidden",
    paddingBottom: "64px", // leave room at bottom for the fixed tabBar
  },
};
