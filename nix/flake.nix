{
  description = "alaska-rcv.dummthings.dev dev shell";
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  outputs = { self, nixpkgs }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" "aarch64-darwin" "x86_64-darwin" ];
      forAll = f: nixpkgs.lib.genAttrs systems (s: f nixpkgs.legacyPackages.${s});
    in {
      devShells = forAll (pkgs: {
        # wrangler comes from nixpkgs because npm's prebuilt workerd binary cannot run on NixOS.
        default = pkgs.mkShell { packages = [ pkgs.wrangler pkgs.hugo ]; };
      });
    };
}
