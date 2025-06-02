// src/components/TabsLayout.tsx
import React from "react";
import { NavLink, Outlet } from "react-router-dom";

export function TabsLayout() {
  return (
    <div style={styles.outerContainer}>
      {/* 1) Top tab bar */}
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

      {/* 2) Content area for whichever tab is active */}
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
    height: "100vh",
    backgroundColor: "#000",
  },
  tabBar: {
    display: "flex",
    justifyContent: "space-around",
    alignItems: "center",
    height: "64px",               // increased from 56px
    backgroundColor: "#111",
    borderBottom: "1px solid #333",
    zIndex: 10,
  },
  tab: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    color: "#888",
    textDecoration: "none",
    fontSize: "14px",             // increased from 12px
    gap: "4px",                   // a bit more space between icon & label
    width: "25%",                 // each of four tabs is 25% wide
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
    borderBottom: "3px solid #e50914", // thicker active indicator
    transition: "color 0.2s, border-bottom 0.2s",
  },
  icon: {
    fontSize: "28px",             // increased from 20px
    lineHeight: 1,
  },
  label: {
    fontSize: "14px",             // matches the “fontSize” in tab/activeTab
    fontWeight: 500,
  },
  contentContainer: {
    flex: 1,
    overflow: "auto",
  },
};
