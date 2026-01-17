{
  description = "neoropilot flake";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };
  outputs = {
    self,
    nixpkgs,
    flake-utils,
  }:
    flake-utils.lib.eachDefaultSystem
    (system: let
      overlays = [
        (self: super: {
          nodejs = super.nodejs_22;
        })
      ];
      pkgs = import nixpkgs {
        inherit system overlays;
      };
      nativeBuildInputs = with pkgs; [
        git
        alejandra
        postgresql
        docker-compose
        pnpm
        nodejs
        typescript
        yarn-berry_4
        nodePackages.vercel
        openssl
        prisma-engines_6
      ];
      devEnvVars = rec {
        PRISMA_SCHEMA_ENGINE_BINARY = "${pkgs.prisma-engines_6}/bin/schema-engine";
        PRISMA_QUERY_ENGINE_BINARY = "${pkgs.prisma-engines_6}/bin/query-engine";
        PRISMA_QUERY_ENGINE_LIBRARY = "${pkgs.prisma-engines_6}/lib/libquery_engine.node";
        PRISMA_FMT_BINARY = "${pkgs.prisma-engines_6}/bin/prisma-fmt";
        PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING = "1";
      };
    in
      with pkgs; {
        devShells.default = mkShell (devEnvVars
          // {
            inherit nativeBuildInputs;
          });

        formatter = alejandra;
      });
}
