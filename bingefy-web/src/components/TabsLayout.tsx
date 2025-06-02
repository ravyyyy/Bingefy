// src/components/TabsLayout.tsx
import React from "react";
import { NavLink, Outlet } from "react-router-dom";

export function TabsLayout() {
  return (
    <div style={styles.outerContainer}>
      {/* 1) Top tab bar */}
      <nav style={styles.tabBar}>
        {/* NavLink automatically adds an “active” class when the route matches */}
        <NavLink to="shows" style={({ isActive }) => (isActive ? styles.activeTab : styles.tab)}>
          {/* You can swap these emojis for actual icons later */}
          <span style={styles.icon}>📺</span>
          <span style={styles.label}>Shows</span>
        </NavLink>
        <NavLink to="movies" style={({ isActive }) => (isActive ? styles.activeTab : styles.tab)}>
          <span style={styles.icon}>🎬</span>
          <span style={styles.label}>Movies</span>
        </NavLink>
        <NavLink to="explore" style={({ isActive }) => (isActive ? styles.activeTab : styles.tab)}>
          <span style={styles.icon}>🔍</span>
          <span style={styles.label}>Explore</span>
        </NavLink>
        <NavLink to="profile" style={({ isActive }) => (isActive ? styles.activeTab : styles.tab)}>
          <span style={styles.icon}>👤</span>
          <span style={styles.label}>Profile</span>
        </NavLink>
      </nav>

      {/* 2) Where the selected tab’s content is rendered */}
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
    height: "56px",
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
    fontSize: "12px",
    gap: "2px",
    width: "25%", // four tabs share equal width
    height: "100%",
  },
  activeTab: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    color: "#fff",
    textDecoration: "none",
    fontSize: "12px",
    gap: "2px",
    width: "25%",
    height: "100%",
    borderBottom: "2px solid #e50914", // red indicator for active tab
  },
  icon: {
    fontSize: "20px",
    lineHeight: 1,
  },
  label: {
    fontSize: "10px",
  },
  contentContainer: {
    flex: 1,
    overflow: "auto",
  },
};
