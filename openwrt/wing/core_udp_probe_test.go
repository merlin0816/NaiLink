// SPDX-License-Identifier: AGPL-3.0-only
package dae

import (
	"bytes"
	"context"
	"encoding/binary"
	"io"
	"net"
	"strconv"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	dns "github.com/miekg/dns"
)

func TestRouterUDPProbeRecoversOneLostDatagramWithinOriginalDeadline(t *testing.T) {
	for _, mode := range []string{"manual", "dns"} {
		scenarios := []string{"success", "drop_first", "drop_all", "cancel", "short_deadline", "invalid", "wrong_target"}
		if mode == "dns" {
			scenarios = append(scenarios, "update", "transfer")
		}
		for _, scenario := range scenarios {
			t.Run(mode+"/"+scenario, func(t *testing.T) {
				tcp, udp, err := routerLoopbackPair(net.Listen, net.ListenPacket)
				if err != nil {
					t.Fatal(err)
				}
				_, number, _ := net.SplitHostPort(tcp.Addr().String())
				port, _ := strconv.Atoi(number)
				var workers sync.WaitGroup
				t.Cleanup(func() { tcp.Close(); udp.Close(); workers.Wait() })
				ctx, cancel := context.WithTimeout(context.Background(), 1500*time.Millisecond)
				if scenario == "drop_all" || scenario == "update" || scenario == "transfer" {
					cancel()
					ctx, cancel = context.WithTimeout(context.Background(), 750*time.Millisecond)
				}
				if scenario == "short_deadline" {
					cancel()
					ctx, cancel = context.WithTimeout(context.Background(), 180*time.Millisecond)
				}
				defer cancel()
				workers.Go(func() {
					c, err := tcp.Accept()
					if err != nil {
						return
					}
					defer c.Close()
					_ = c.SetDeadline(time.Now().Add(3 * time.Second))
					var hello [3]byte
					if _, err = io.ReadFull(c, hello[:]); err != nil {
						return
					}
					if hello != [3]byte{5, 1, 2} {
						t.Error("unexpected SOCKS methods")
						return
					}
					if _, err = c.Write([]byte{5, 2}); err != nil {
						return
					}
					var auth [2]byte
					if _, err = io.ReadFull(c, auth[:]); err != nil {
						return
					}
					if _, err = io.CopyN(io.Discard, c, int64(auth[1])); err != nil {
						return
					}
					if _, err = io.ReadFull(c, auth[:1]); err != nil {
						return
					}
					if _, err = io.CopyN(io.Discard, c, int64(auth[0])); err != nil {
						return
					}
					if _, err = c.Write([]byte{1, 0}); err != nil {
						return
					}
					var associate [10]byte
					if _, err = io.ReadFull(c, associate[:]); err != nil {
						return
					}
					response := []byte{5, 0, 0, 1, 127, 0, 0, 1}
					response = binary.BigEndian.AppendUint16(response, uint16(port))
					if _, err = c.Write(response); err != nil {
						return
					}
					_, _ = io.Copy(io.Discard, c)
				})
				var calls atomic.Int32
				workers.Go(func() {
					buffer := make([]byte, 2048)
					var first []byte
					var source string
					for {
						n, addr, err := udp.ReadFrom(buffer)
						if err != nil {
							return
						}
						count := calls.Add(1)
						if n < 10 {
							t.Error("short SOCKS UDP packet")
							return
						}
						packet := append([]byte(nil), buffer[:n]...)
						if count == 1 {
							first = packet
							source = addr.String()
						} else if !bytes.Equal(first, packet) || source != addr.String() {
							t.Error("retry changed target, DNS query or relay socket")
							return
						}
						if count > 2 {
							t.Error("unbounded UDP retransmission")
							return
						}
						if scenario == "cancel" {
							cancel()
							continue
						}
						if scenario == "drop_all" || scenario == "short_deadline" || scenario == "drop_first" && count == 1 || scenario == "update" || scenario == "transfer" {
							continue
						}
						query := new(dns.Msg)
						if query.Unpack(packet[10:]) != nil {
							t.Error("invalid DNS query")
							return
						}
						answer := new(dns.Msg)
						answer.SetReply(query)
						answer.Answer = []dns.RR{&dns.A{Hdr: dns.RR_Header{Name: query.Question[0].Name, Rrtype: dns.TypeA, Class: dns.ClassINET, Ttl: 60}, A: net.IPv4(192, 0, 2, 1)}}
						if scenario == "invalid" {
							answer.Id++
						}
						if scenario == "wrong_target" {
							packet[4] = 9
						}
						data, _ := answer.Pack()
						_, _ = udp.WriteTo(append(packet[:10], data...), addr)
					}
				})
				session := &routerSingBoxSession{ports: sbPorts{Mixed: port, Secret: "fixture"}}
				started := time.Now()
				if mode == "manual" {
					err = routerSOCKSUDPQuery(ctx, session, net.IPv4(8, 8, 8, 8), 53)
				} else {
					q := new(dns.Msg)
					q.SetQuestion("www.google.com.", dns.TypeA)
					if scenario == "update" {
						q.Opcode = dns.OpcodeUpdate
					}
					if scenario == "transfer" {
						q.Question[0].Qtype = dns.TypeAXFR
					}
					_, err = routerSOCKSDNSExchange(ctx, session.ports, net.IPv4(8, 8, 8, 8), 53, q)
				}
				want := int32(1)
				if scenario == "drop_first" || scenario == "drop_all" {
					want = 2
				}
				if calls.Load() != want {
					t.Fatal("unexpected datagram count", calls.Load(), want)
				}
				if scenario == "success" || scenario == "drop_first" {
					if err != nil {
						t.Fatal("valid DNS reply failed", err)
					}
				} else if err == nil {
					t.Fatal("invalid/unanswered/cancelled query accepted")
				}
				if scenario == "invalid" && err.Error() != "invalid_dns_reply" {
					t.Fatal(err)
				}
				if scenario == "cancel" && time.Since(started) > time.Second {
					t.Fatal("cancellation did not release sockets promptly")
				}
			})
		}
	}
}
